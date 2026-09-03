using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using Wp = DocumentFormat.OpenXml.Wordprocessing;

namespace Yibiao.OpenXmlHelper.Jobs;

/// <summary>扫描投标模板正文中的明确占位和简单空单元格，输出供 Agent 分类的稳定候选。</summary>
static class TemplateFieldScanner
{
    static readonly Regex PlaceholderPattern = new(
        @"_{2,}|＿{2,}|【\s*(?:待填写|人工处理)\s*[：:]?[^】]*】|\(\s*\)|（\s*）",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);
    static readonly Regex TrailingLabelPattern = new(
        @"(?<label>[\p{L}\p{N}（）()《》/·\-]{2,30})[：:]\s*$",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);
    static readonly Regex ExplicitNamePattern = new(
        @"【\s*(?:待填写|人工处理)\s*[：:]\s*(?<name>[^】]+)】",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);
    static readonly Regex ManualPattern = new(
        @"签字|签名|签章|盖章|公章|印章|手印|法定代表人签|授权代表签",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public static TemplateFieldCandidateFile Scan(WordprocessingDocument document)
    {
        var part = document.MainDocumentPart ?? throw new InvalidOperationException("投标模版缺少正文部件");
        var body = part.Document.Body ?? throw new InvalidOperationException("投标模版正文为空");
        var result = new TemplateFieldCandidateFile();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var order = 0;

        for (var blockIndex = 0; blockIndex < body.ChildElements.Count; blockIndex += 1)
        {
            var block = body.ChildElements[blockIndex];
            var blockPath = $"body/{blockIndex}:{block.LocalName}";
            ScanElement(block, blockPath, result.Candidates, seen, ref order);
        }

        return result;
    }

    static void ScanElement(
        OpenXmlElement element,
        string path,
        List<TemplateFieldCandidate> candidates,
        HashSet<string> seen,
        ref int order)
    {
        if (element is Wp.SdtRun runControl)
        {
            ScanExistingControl(runControl, path, candidates, seen, ref order);
            return;
        }

        if (element is Wp.SdtBlock blockControl)
        {
            ScanExistingControl(blockControl, path, candidates, seen, ref order);
            return;
        }

        if (element is Wp.SdtCell or Wp.SdtRow)
        {
            return;
        }

        if (element is Wp.Paragraph paragraph)
        {
            ScanParagraph(paragraph, path, candidates, seen, ref order);
            return;
        }

        if (element is Wp.Table table)
        {
            ScanTable(table, path, candidates, seen, ref order);
            return;
        }

        for (var index = 0; index < element.ChildElements.Count; index += 1)
        {
            var child = element.ChildElements[index];
            ScanElement(child, $"{path}/{index}:{child.LocalName}", candidates, seen, ref order);
        }
    }

    static void ScanTable(
        Wp.Table table,
        string path,
        List<TemplateFieldCandidate> candidates,
        HashSet<string> seen,
        ref int order)
    {
        var rows = table.Elements<Wp.TableRow>().ToList();
        for (var rowIndex = 0; rowIndex < rows.Count; rowIndex += 1)
        {
            var cells = rows[rowIndex].Elements<Wp.TableCell>().ToList();
            var rowTexts = cells.Select(ReadCellText).ToList();
            for (var cellIndex = 0; cellIndex < cells.Count; cellIndex += 1)
            {
                var cell = cells[cellIndex];
                var cellPath = $"{path}/row/{rowIndex}/cell/{cellIndex}";
                var paragraphs = cell.Elements<Wp.Paragraph>().ToList();
                for (var paragraphIndex = 0; paragraphIndex < paragraphs.Count; paragraphIndex += 1)
                {
                    ScanParagraph(
                        paragraphs[paragraphIndex],
                        $"{cellPath}/p/{paragraphIndex}",
                        candidates,
                        seen,
                        ref order);
                }

                if (!IsSimpleEmptyCell(cell, rowTexts[cellIndex])) continue;
                var targetParagraph = paragraphs.FirstOrDefault();
                if (targetParagraph is null) continue;
                var context = BuildCellContext(rowTexts, cellIndex);
                AddCandidate(
                    candidates,
                    seen,
                    ref order,
                    kind: "empty-table-cell",
                    location: $"{cellPath}/p/0",
                    text: "",
                    context,
                    suggestedName: SuggestName(context),
                    suggestedFillBy: SuggestFillBy(context),
                    target: targetParagraph,
                    start: 0,
                    length: 0);
            }
        }
    }

    static void ScanExistingControl(
        OpenXmlElement control,
        string path,
        List<TemplateFieldCandidate> candidates,
        HashSet<string> seen,
        ref int order)
    {
        var properties = control switch
        {
            Wp.SdtRun run => run.SdtProperties,
            Wp.SdtBlock block => block.SdtProperties,
            _ => null,
        };
        var name = properties?.GetFirstChild<Wp.SdtAlias>()?.Val?.Value?.Trim() ?? "";
        var controlText = WordWorkspace.Normalize(control.InnerText ?? "");
        var context = Limit(controlText, 200);
        AddCandidate(
            candidates,
            seen,
            ref order,
            kind: "existing-content-control",
            location: path,
            text: controlText,
            context,
            suggestedName: name.Length > 0 ? name : SuggestName(controlText),
            suggestedFillBy: SuggestFillBy($"{name} {controlText}"),
            target: control,
            start: 0,
            length: 0);
    }

    static void ScanParagraph(
        Wp.Paragraph paragraph,
        string path,
        List<TemplateFieldCandidate> candidates,
        HashSet<string> seen,
        ref int order)
    {
        var existingControls = paragraph.Descendants<Wp.SdtRun>().ToList();
        if (existingControls.Count > 0)
        {
            for (var index = 0; index < existingControls.Count; index += 1)
            {
                ScanExistingControl(existingControls[index], $"{path}/sdt/{index}", candidates, seen, ref order);
            }
            return;
        }

        if (!IsSimpleParagraph(paragraph)) return;
        var text = ReadParagraphText(paragraph);
        if (text.Length == 0)
        {
            return;
        }

        var placeholderMatches = PlaceholderPattern.Matches(text).Cast<Match>().ToList();
        foreach (var match in placeholderMatches)
        {
            var context = BuildContext(text, match.Index, match.Length);
            var explicitName = ExplicitNamePattern.Match(match.Value).Groups["name"].Value.Trim();
            AddCandidate(
                candidates,
                seen,
                ref order,
                kind: "text-placeholder",
                location: path,
                text: match.Value,
                context,
                suggestedName: explicitName.Length > 0 ? explicitName : SuggestName(text[..match.Index]),
                suggestedFillBy: SuggestFillBy(context),
                target: paragraph,
                start: match.Index,
                length: match.Length);
        }

        foreach (var underlined in FindUnderlinedWhitespace(paragraph, text))
        {
            if (placeholderMatches.Any(match =>
                underlined.Start < match.Index + match.Length
                && match.Index < underlined.Start + underlined.Length))
            {
                continue;
            }
            var context = BuildContext(text, underlined.Start, underlined.Length);
            AddCandidate(
                candidates,
                seen,
                ref order,
                kind: "underlined-space",
                location: path,
                text: text.Substring(underlined.Start, underlined.Length),
                context,
                suggestedName: SuggestName(text[..underlined.Start]),
                suggestedFillBy: SuggestFillBy(context),
                target: paragraph,
                start: underlined.Start,
                length: underlined.Length);
        }

        var trailingLabel = TrailingLabelPattern.Match(text);
        if (trailingLabel.Success)
        {
            var label = trailingLabel.Groups["label"].Value.Trim();
            AddCandidate(
                candidates,
                seen,
                ref order,
                kind: "after-label",
                location: path,
                text: "",
                context: BuildContext(text, text.Length, 0),
                suggestedName: CleanName(label),
                suggestedFillBy: SuggestFillBy(text),
                target: paragraph,
                start: text.Length,
                length: 0);
        }
    }

    static bool IsSimpleParagraph(Wp.Paragraph paragraph)
    {
        if (paragraph.Descendants<Wp.FieldChar>().Any()
            || paragraph.Descendants<Wp.FieldCode>().Any()
            || paragraph.Descendants<Wp.Drawing>().Any()
            || paragraph.Descendants<Wp.DeletedRun>().Any()
            || paragraph.Descendants<Wp.InsertedRun>().Any()
            || paragraph.Descendants<Wp.Hyperlink>().Any())
        {
            return false;
        }

        if (!paragraph.ChildElements.All(item => item is Wp.ParagraphProperties or Wp.Run))
        {
            return false;
        }

        return paragraph.Elements<Wp.Run>()
            .All(run => run.ChildElements.All(item => item is Wp.RunProperties or Wp.Text));
    }

    static string ReadParagraphText(Wp.Paragraph paragraph)
    {
        var builder = new StringBuilder();
        foreach (var run in paragraph.Elements<Wp.Run>())
        {
            foreach (var text in run.Elements<Wp.Text>())
            {
                builder.Append(text.Text);
            }
        }
        return builder.ToString();
    }

    static List<(int Start, int Length)> FindUnderlinedWhitespace(Wp.Paragraph paragraph, string text)
    {
        var result = new List<(int Start, int Length)>();
        var offset = 0;
        foreach (var run in paragraph.Elements<Wp.Run>())
        {
            var runText = string.Concat(run.Elements<Wp.Text>().Select(item => item.Text));
            var underline = run.RunProperties?.Underline;
            if (underline is not null && underline.Val?.Value != Wp.UnderlineValues.None)
            {
                foreach (Match match in Regex.Matches(runText, @"[\s　]{2,}", RegexOptions.CultureInvariant))
                {
                    result.Add((offset + match.Index, match.Length));
                }
            }
            offset += runText.Length;
        }
        return result.Where(item => item.Start >= 0 && item.Start + item.Length <= text.Length).ToList();
    }

    static bool IsSimpleEmptyCell(Wp.TableCell cell, string text)
    {
        if (text.Length > 0) return false;
        if (cell.Elements<Wp.Table>().Any()
            || cell.Descendants<Wp.Drawing>().Any()
            || cell.Descendants<Wp.FieldChar>().Any()
            || cell.Descendants<Wp.SdtElement>().Any())
        {
            return false;
        }

        var merge = cell.TableCellProperties?.VerticalMerge;
        if (merge is not null && merge.Val?.Value != Wp.MergedCellValues.Restart) return false;
        return cell.Elements<Wp.Paragraph>().Count() == 1;
    }

    static string ReadCellText(Wp.TableCell cell)
    {
        return WordWorkspace.Normalize(string.Join(" ", cell.Elements<Wp.Paragraph>().Select(ReadParagraphText)));
    }

    static string BuildCellContext(IReadOnlyList<string> rowTexts, int cellIndex)
    {
        var parts = new List<string>();
        for (var index = 0; index < rowTexts.Count; index += 1)
        {
            if (index == cellIndex || rowTexts[index].Length == 0) continue;
            parts.Add($"第{index + 1}列：{rowTexts[index]}");
        }
        return Limit(string.Join("；", parts), 240);
    }

    static string BuildContext(string text, int start, int length)
    {
        var from = Math.Max(0, start - 80);
        var to = Math.Min(text.Length, start + length + 80);
        return Limit(text[from..to].Replace('\t', ' '), 200);
    }

    static string SuggestName(string context)
    {
        var value = WordWorkspace.Normalize(context);
        var explicitName = ExplicitNamePattern.Match(value).Groups["name"].Value.Trim();
        if (explicitName.Length > 0) return CleanName(explicitName);
        var label = TrailingLabelPattern.Match(value).Groups["label"].Value.Trim();
        if (label.Length > 0) return CleanName(label);
        var pieces = Regex.Split(value, @"[：:；;，,。\s]+", RegexOptions.CultureInvariant)
            .Select(CleanName)
            .Where(item => item.Length >= 2 && item.Length <= 30)
            .ToList();
        return pieces.LastOrDefault() ?? "";
    }

    static string CleanName(string value)
    {
        return Regex.Replace(value ?? "", @"^[\s（(]*|[\s）)＿_]+$", "").Trim();
    }

    static string SuggestFillBy(string context)
    {
        return ManualPattern.IsMatch(context ?? "") ? "manual" : "ai";
    }

    static void AddCandidate(
        List<TemplateFieldCandidate> candidates,
        HashSet<string> seen,
        ref int order,
        string kind,
        string location,
        string text,
        string context,
        string suggestedName,
        string suggestedFillBy,
        OpenXmlElement target,
        int start,
        int length)
    {
        var identity = $"v1\u0000{location}\u0000{kind}\u0000{start}\u0000{length}\u0000{text}\u0000{context}";
        var candidateId = $"c_{Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity)))[..16].ToLowerInvariant()}";
        if (!seen.Add(candidateId)) return;
        candidates.Add(new TemplateFieldCandidate
        {
            CandidateId = candidateId,
            Kind = kind,
            Location = location,
            Text = Limit(text, 120),
            Context = Limit(context, 240),
            SuggestedName = Limit(suggestedName, 80),
            SuggestedFillBy = suggestedFillBy,
            Target = target,
            Start = start,
            Length = length,
            Order = order++,
        });
    }

    static string Limit(string value, int maxLength)
    {
        var text = value ?? "";
        return text.Length <= maxLength ? text : text[..maxLength];
    }
}
