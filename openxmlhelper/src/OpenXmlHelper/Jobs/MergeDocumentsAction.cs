using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using Wp = DocumentFormat.OpenXml.Wordprocessing;

namespace Yibiao.OpenXmlHelper.Jobs;

sealed class MergeDocumentsRequest
{
    public string Action { get; set; } = "";
    public string CoverTemplate { get; set; } = "";
    public Dictionary<string, string> CoverFields { get; set; } = new();
    public string BodyDoc { get; set; } = "";
    public string Output { get; set; } = "";
}

/// <summary>把封面 docx 的两个 section（封面、尾页）插入到正文 docx 前后，并回显封面字段。</summary>
static class MergeDocumentsAction
{
    public const string Name = "merge-documents";
    const string RelationshipNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

    // 封面字段标签：以中文冒号或英文冒号结尾。聚合段落后匹配"委托单位：""报告编号："等。
    static readonly Regex CoverFieldPattern = new(
        @"(?<label>委托单位|报告编号|编制日期|编制单位)\s*[：:]\s*$",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public static JobResult Execute(string workspace, string jobId)
    {
        if (!TryReadRequest(workspace, jobId, out var request, out var error))
        {
            return JobResult.Fail(error);
        }

        try
        {
            // 封面模板、用户保存路径可能位于工作区外（应用 assets、用户下载目录），
            // 由 Node 侧确保可信，此处直接取绝对路径，不做工作区边界校验。
            var coverPath = Path.GetFullPath(request.CoverTemplate);
            var bodyPath = Path.GetFullPath(request.BodyDoc);
            var outputPath = Path.GetFullPath(request.Output);
            if (!File.Exists(coverPath)) return JobResult.Fail("封面模版不存在");
            if (!File.Exists(bodyPath)) return JobResult.Fail("正文 docx 不存在");
            if (WordWorkspace.PathsEqual(bodyPath, outputPath)) return JobResult.Fail("正文和输出不能使用同一路径");

            Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);
            File.Copy(bodyPath, outputPath, overwrite: true);

            using var cover = WordprocessingDocument.Open(coverPath, false);
            using var dest = WordprocessingDocument.Open(outputPath, true);
            var coverPart = cover.MainDocumentPart ?? throw new InvalidOperationException("封面缺少正文部件");
            var destPart = dest.MainDocumentPart ?? throw new InvalidOperationException("输出文档缺少正文部件");
            var coverBody = coverPart.Document.Body ?? throw new InvalidOperationException("封面正文为空");
            var destBody = destPart.Document.Body ?? throw new InvalidOperationException("输出正文为空");

            var (frontBlocks, backBlocks, frontSectPr, backSectPr) = SplitCoverSections(coverBody);
            var styleMap = CreateStyleMap(coverPart, destPart);
            var context = new CrossDocumentImportContext(styleMap);

            // 在输出 body 开头插入封面 + 结束封面节的 sectPr 段落
            var insertPos = 0;
            foreach (var block in frontBlocks)
            {
                var cloned = (OpenXmlElement)block.CloneNode(true);
                NormalizeStyleReferences(cloned, context.StyleIds);
                RemapNumbering(cloned, coverPart, destPart, context);
                RemapRelationships(cloned, coverPart, destPart, context.RelationshipIds);
                destBody.InsertAt(cloned, insertPos);
                insertPos++;
            }
            if (frontSectPr is not null)
            {
                var sectPara = new Wp.Paragraph(new Wp.ParagraphProperties((Wp.SectionProperties)frontSectPr.CloneNode(true)));
                destBody.InsertAt(sectPara, insertPos);
            }

            // 把正文 body 末尾 sectPr（1440 边距等）提升为段落级 sectPr，
            // 让正文成为独立 section；尾页内容 + 尾页 sectPr 作为 body 末尾 section。
            // 这样 sectPr 顺序：封面sectPr(零边距) → 正文sectPr(1440) → 尾页sectPr(零边距)
            // 每个 sectPr 定义它之前内容的 section 属性，三段互不干扰。
            var lastSectPr = destBody.Elements<Wp.SectionProperties>().LastOrDefault();
            if (lastSectPr is not null)
            {
                // 把 body 末尾 sectPr 转成段落级 sectPr（空段落带 pPr/sectPr）
                var bodySectClone = (Wp.SectionProperties)lastSectPr.CloneNode(true);
                var bodySectPara = new Wp.Paragraph(new Wp.ParagraphProperties(bodySectClone));
                // 在原 sectPr 之前插入这个段落级 sectPr
                lastSectPr.InsertBeforeSelf(bodySectPara);
                // 移除原 body 末尾 sectPr（已转为段落级）
                lastSectPr.Remove();
            }

            // 现在把尾页内容 + 尾页 sectPr 追加到 body 末尾
            foreach (var block in backBlocks)
            {
                var cloned = (OpenXmlElement)block.CloneNode(true);
                NormalizeStyleReferences(cloned, context.StyleIds);
                RemapNumbering(cloned, coverPart, destPart, context);
                RemapRelationships(cloned, coverPart, destPart, context.RelationshipIds);
                destBody.AppendChild(cloned);
            }
            // 尾页 section 用封面模板尾页的 sectPr（零边距），让尾页内容铺满整页
            if (backSectPr is not null)
            {
                // 尾页 sectPr 作为 body 末尾 sectPr（非段落级），定义尾页 section
                destBody.AppendChild((Wp.SectionProperties)backSectPr.CloneNode(true));
            }

            // 字段回显
            ApplyCoverFields(destBody, request.CoverFields ?? new());
            // 修正"招标与采购网/采购招标网"等行用前导空格做缩进导致的字间距过大问题
            NormalizeWebsiteLineIndent(destBody);
            // 替换封面大标题"能源评价报告"为用户勾选的报告类型名称
            var fields = request.CoverFields ?? new();
            if (fields.TryGetValue("reportTitle", out var reportTitle) && !string.IsNullOrWhiteSpace(reportTitle))
            {
                ReplaceCoverTitle(destBody, reportTitle!);
            }
            // 去掉公示网址文本里的换行符，确保一行展示
            NormalizeWebsiteLineBreaks(destBody);

            destPart.Document.Save();
            // output 可能位于工作区外（用户保存路径），直接返回绝对路径
            return JobResult.Success(Name, outputPath);
        }
        catch (Exception exception)
        {
            return JobResult.Fail(exception.Message);
        }
    }

    /// <summary>把封面 body 按第一个段落级 sectPr 拆成前后两组；front=封面（第一节），back=尾页（第二节）。</summary>
    static (List<OpenXmlElement> Front, List<OpenXmlElement> Back, Wp.SectionProperties? FrontSectPr, Wp.SectionProperties? BackSectPr) SplitCoverSections(Wp.Body body)
    {
        var children = body.ChildElements.ToList();
        var front = new List<OpenXmlElement>();
        var back = new List<OpenXmlElement>();
        Wp.SectionProperties? frontSectPr = null;
        Wp.SectionProperties? backSectPr = null;
        var frontDone = false;

        for (var i = 0; i < children.Count; i++)
        {
            var child = children[i];
            if (!frontDone)
            {
                // 第一节 = 封面：收集到 front
                if (child is Wp.Paragraph p && p.ParagraphProperties?.SectionProperties is not null)
                {
                    // 提取段落级 sectPr 作为封面节属性，不把该段落加入内容
                    frontSectPr = (Wp.SectionProperties)p.ParagraphProperties.SectionProperties.CloneNode(true);
                    frontDone = true;
                }
                else if (child is Wp.SectionProperties sp)
                {
                    frontSectPr = (Wp.SectionProperties)sp.CloneNode(true);
                }
                else
                {
                    front.Add(child);
                }
            }
            else
            {
                // 第二节 = 尾页：收集到 back，并保留 body 末尾 sectPr 作为尾页 section 属性
                if (child is Wp.SectionProperties bodySp)
                {
                    backSectPr = (Wp.SectionProperties)bodySp.CloneNode(true);
                    continue;
                }
                back.Add(child);
            }
        }

        return (front, back, frontSectPr, backSectPr);
    }

    /// <summary>遍历所有段落（含文本框内），匹配"委托单位："等 after-label，在段落末尾追加字段值 Run。</summary>
    static void ApplyCoverFields(Wp.Body body, Dictionary<string, string> fields)
    {
        if (fields.Count == 0) return;
        foreach (var paragraph in body.Descendants<Wp.Paragraph>().ToList())
        {
            // 只读取段落直接子级 run 的文本，避免外层包裹段落（含文本框 drawing）
            // 因为读到文本框内标签而被误判为字段段落，导致在外层追加多余 run。
            var text = ReadDirectRunText(paragraph);
            if (text.Length == 0) continue;
            var match = CoverFieldPattern.Match(text);
            if (!match.Success) continue;
            var label = match.Groups["label"].Value;
            if (!fields.TryGetValue(label, out var value) || string.IsNullOrWhiteSpace(value)) continue;
            AppendFieldValueRun(paragraph, value);
        }
    }

    static string ReadParagraphText(Wp.Paragraph paragraph)
    {
        var builder = new StringBuilder();
        foreach (var run in paragraph.Descendants<Wp.Run>())
        {
            foreach (var text in run.Elements<Wp.Text>())
            {
                builder.Append(text.Text);
            }
        }
        return builder.ToString();
    }

    /// <summary>只读取段落直接子级 run 的文本，不进入文本框等嵌套结构。</summary>
    static string ReadDirectRunText(Wp.Paragraph paragraph)
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

    static void AppendFieldValueRun(Wp.Paragraph paragraph, string value)
    {
        // 只取段落的直接子级 run，避免取到文本框等嵌套结构里的 run，
        // 确保字段值追加在标签 run 同一段落同一层级，继承相同字体/字号属性。
        var lastRun = paragraph.Elements<Wp.Run>().LastOrDefault();
        var newRun = new Wp.Run();
        if (lastRun?.RunProperties is not null)
        {
            var props = (Wp.RunProperties)lastRun.RunProperties.CloneNode(true);
            // 字段值显式加粗，让回显内容视觉上和标签区分/突出
            if (props.GetFirstChild<Wp.Bold>() is null)
            {
                props.InsertAt(new Wp.Bold(), 0);
            }
            newRun.AppendChild(props);
        }
        else
        {
            var props = new Wp.RunProperties();
            props.AppendChild(new Wp.Bold());
            newRun.AppendChild(props);
        }
        newRun.AppendChild(new Wp.Text(value) { Space = SpaceProcessingModeValues.Preserve });
        if (lastRun is not null)
        {
            lastRun.InsertAfterSelf(newRun);
        }
        else
        {
            paragraph.AppendChild(newRun);
        }
    }

    /// <summary>
    /// 修正封面里"招标与采购网""采购招标网"等行用大量前导空格做缩进导致的字间距过大问题。
    /// 去除前导空格，改用段落缩进 w:ind 对齐"公示网址："的冒号位置。
    /// </summary>
    static void NormalizeWebsiteLineIndent(Wp.Body body)
    {
        foreach (var paragraph in body.Descendants<Wp.Paragraph>().ToList())
        {
            var run = paragraph.Elements<Wp.Run>().FirstOrDefault();
            if (run is null) continue;
            var text = run.GetFirstChild<Wp.Text>();
            if (text?.Text is null || text.Text.Length == 0) continue;

            // 只处理以前导空格开头且内容为"招标与采购网/采购招标网..."的网址行
            var raw = text.Text;
            var leadingSpaces = raw.TakeWhile(c => c == ' ' || c == '\u3000').Count();
            if (leadingSpaces <= 0) continue;
            var trimmed = raw.AsSpan(leadingSpaces).ToString();
            if (!trimmed.StartsWith("招标与采购网") && !trimmed.StartsWith("采购招标网")) continue;

            // 去掉前导空格
            text.Text = trimmed;
            text.Space = SpaceProcessingModeValues.Preserve;

            // 用段落缩进替代空格：约 5 个中文字符宽度（与"公示网址："对齐）
            var pPr = paragraph.GetFirstChild<Wp.ParagraphProperties>();
            if (pPr is null)
            {
                pPr = new Wp.ParagraphProperties();
                paragraph.InsertAt(pPr, 0);
            }
            // 移除已有 ind，避免叠加
            pPr.GetFirstChild<Wp.Indentation>()?.Remove();
            // leftChars=5 表示 5 个字符宽度的左缩进
            pPr.AppendChild(new Wp.Indentation { LeftChars = 5 });
        }
    }

    /// <summary>
    /// 替换封面大标题（如"能源评价报告"）为用户勾选的报告类型名称。
    /// 遍历所有段落，把段落内文本等于原标题的 run 文本替换为新标题。
    /// </summary>
    static void ReplaceCoverTitle(Wp.Body body, string reportTitle)
    {
        const string originalTitle = "能源评价报告";
        foreach (var text in body.Descendants<Wp.Text>().ToList())
        {
            if (text.Text == originalTitle)
            {
                text.Text = reportTitle;
                text.Space = SpaceProcessingModeValues.Preserve;
            }
        }
    }

    /// <summary>
    /// 去掉"公示网址"所在段落文本里的换行符（\n \r），确保一行展示不换行。
    /// </summary>
    static void NormalizeWebsiteLineBreaks(Wp.Body body)
    {
        foreach (var paragraph in body.Descendants<Wp.Paragraph>().ToList())
        {
            var text = ReadDirectRunText(paragraph);
            if (!text.StartsWith("公示网址")) continue;
            foreach (var t in paragraph.Descendants<Wp.Text>().ToList())
            {
                if (t.Text.Contains('\n') || t.Text.Contains('\r'))
                {
                    t.Text = t.Text.Replace("\r", "").Replace("\n", "");
                    t.Space = SpaceProcessingModeValues.Preserve;
                }
            }
        }
    }

    static bool TryReadRequest(string workspace, string jobId, out MergeDocumentsRequest request, out string error)
    {
        request = new MergeDocumentsRequest();
        error = "";
        try
        {
            var path = Path.Combine(JobFolder.GetJobDirectory(workspace, jobId), JobFolder.RequestFileName);
            var parsed = JsonSerializer.Deserialize<MergeDocumentsRequest>(File.ReadAllText(path, Encoding.UTF8), JsonOptions.File);
            if (parsed is null
                || string.IsNullOrWhiteSpace(parsed.CoverTemplate)
                || string.IsNullOrWhiteSpace(parsed.BodyDoc)
                || string.IsNullOrWhiteSpace(parsed.Output))
            {
                error = "request.json 缺少 cover_template、body_doc 或 output";
                return false;
            }
            request = parsed;
            request.CoverTemplate = request.CoverTemplate.Trim();
            request.BodyDoc = request.BodyDoc.Trim();
            request.Output = request.Output.Trim();
            return true;
        }
        catch (Exception exception)
        {
            error = $"无法读取 request.json：{exception.Message}";
            return false;
        }
    }

    // ===== 跨文档导入 helper（与 ExtractChaptersAction 同源，复制以隔离风险）=====

    static Dictionary<string, string?> CreateStyleMap(MainDocumentPart sourcePart, MainDocumentPart destPart)
    {
        var sourceStyles = sourcePart.StyleDefinitionsPart?.Styles?.Elements<Wp.Style>().ToList() ?? [];
        var targetStyles = destPart.StyleDefinitionsPart?.Styles?.Elements<Wp.Style>().ToList() ?? [];
        var targetById = targetStyles
            .Where(style => !string.IsNullOrWhiteSpace(style.StyleId?.Value))
            .GroupBy(style => style.StyleId!.Value!, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.Ordinal);
        var targetByName = targetStyles
            .Select(style => (Style: style, Key: GetStyleNameKey(style)))
            .Where(item => item.Key.Length > 0)
            .GroupBy(item => item.Key, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First().Style, StringComparer.OrdinalIgnoreCase);
        var result = new Dictionary<string, string?>(StringComparer.Ordinal);

        foreach (var sourceStyle in sourceStyles)
        {
            var sourceId = sourceStyle.StyleId?.Value;
            if (string.IsNullOrWhiteSpace(sourceId)) continue;
            if (targetById.TryGetValue(sourceId, out var sameId)
                && sameId.Type?.Value == sourceStyle.Type?.Value)
            {
                result[sourceId] = sourceId;
                continue;
            }

            var nameKey = GetStyleNameKey(sourceStyle);
            result[sourceId] = nameKey.Length > 0 && targetByName.TryGetValue(nameKey, out var sameName)
                ? sameName.StyleId?.Value
                : null;
        }

        return result;
    }

    static string GetStyleNameKey(Wp.Style style)
    {
        var name = style.StyleName?.Val?.Value?.Trim() ?? "";
        return name.Length == 0 ? "" : $"{style.Type?.Value}:{name}";
    }

    static void NormalizeStyleReferences(OpenXmlElement cloned, Dictionary<string, string?> styleIds)
    {
        foreach (var style in cloned.Descendants<Wp.ParagraphStyleId>().ToList())
        {
            ApplyStyleMap(style.Val?.Value, styleIds, value => style.Val = value, style.Remove);
        }
        foreach (var style in cloned.Descendants<Wp.RunStyle>().ToList())
        {
            ApplyStyleMap(style.Val?.Value, styleIds, value => style.Val = value, style.Remove);
        }
        foreach (var style in cloned.Descendants<Wp.TableStyle>().ToList())
        {
            ApplyStyleMap(style.Val?.Value, styleIds, value => style.Val = value, style.Remove);
        }
        foreach (var style in cloned.Descendants<Wp.StyleLink>().ToList())
        {
            ApplyStyleMap(style.Val?.Value, styleIds, value => style.Val = value, style.Remove);
        }
        foreach (var style in cloned.Descendants<Wp.NumberingStyleLink>().ToList())
        {
            ApplyStyleMap(style.Val?.Value, styleIds, value => style.Val = value, style.Remove);
        }
    }

    static void ApplyStyleMap(
        string? sourceId,
        Dictionary<string, string?> styleIds,
        Action<string> apply,
        Action remove)
    {
        if (!string.IsNullOrWhiteSpace(sourceId)
            && styleIds.TryGetValue(sourceId, out var targetId)
            && !string.IsNullOrWhiteSpace(targetId))
        {
            apply(targetId);
            return;
        }
        remove();
    }

    static void RemapNumbering(
        OpenXmlElement cloned,
        MainDocumentPart sourcePart,
        MainDocumentPart destPart,
        CrossDocumentImportContext context)
    {
        foreach (var properties in cloned.Descendants<Wp.NumberingProperties>().ToList())
        {
            var sourceNumberId = properties.NumberingId?.Val?.Value;
            if (sourceNumberId is null) continue;
            var targetNumberId = ImportNumbering(sourceNumberId.Value, sourcePart, destPart, context);
            if (targetNumberId is null)
            {
                properties.Remove();
                continue;
            }
            properties.NumberingId!.Val = targetNumberId.Value;
        }
    }

    static int? ImportNumbering(
        int sourceNumberId,
        MainDocumentPart sourcePart,
        MainDocumentPart destPart,
        CrossDocumentImportContext context)
    {
        if (context.NumberingIds.TryGetValue(sourceNumberId, out var cached)) return cached;
        var sourceNumberingPart = sourcePart.NumberingDefinitionsPart;
        var sourceNumbering = sourceNumberingPart?.Numbering;
        if (sourceNumberingPart is null || sourceNumbering is null) return null;
        var sourceInstance = sourceNumbering.Elements<Wp.NumberingInstance>()
            .FirstOrDefault(item => item.NumberID?.Value == sourceNumberId);
        var sourceAbstractId = sourceInstance?.AbstractNumId?.Val?.Value;
        if (sourceInstance is null || sourceAbstractId is null) return null;
        var sourceAbstract = sourceNumbering.Elements<Wp.AbstractNum>()
            .FirstOrDefault(item => item.AbstractNumberId?.Value == sourceAbstractId.Value);
        if (sourceAbstract is null) return null;

        var destNumberingPart = destPart.NumberingDefinitionsPart ?? destPart.AddNewPart<NumberingDefinitionsPart>();
        destNumberingPart.Numbering ??= new Wp.Numbering();
        var destNumbering = destNumberingPart.Numbering;
        var targetAbstractId = destNumbering.Elements<Wp.AbstractNum>()
            .Select(item => item.AbstractNumberId?.Value ?? -1)
            .DefaultIfEmpty(-1)
            .Max() + 1;
        var targetNumberId = destNumbering.Elements<Wp.NumberingInstance>()
            .Select(item => item.NumberID?.Value ?? 0)
            .DefaultIfEmpty(0)
            .Max() + 1;

        var copiedAbstract = (Wp.AbstractNum)sourceAbstract.CloneNode(true);
        copiedAbstract.AbstractNumberId = targetAbstractId;
        NormalizeStyleReferences(copiedAbstract, context.StyleIds);
        var firstInstance = destNumbering.Elements<Wp.NumberingInstance>().FirstOrDefault();
        if (firstInstance is null) destNumbering.AppendChild(copiedAbstract);
        else destNumbering.InsertBefore(copiedAbstract, firstInstance);

        var copiedInstance = (Wp.NumberingInstance)sourceInstance.CloneNode(true);
        copiedInstance.NumberID = targetNumberId;
        copiedInstance.AbstractNumId ??= new Wp.AbstractNumId();
        copiedInstance.AbstractNumId.Val = targetAbstractId;
        destNumbering.AppendChild(copiedInstance);
        destNumbering.Save();
        context.NumberingIds[sourceNumberId] = targetNumberId;
        return targetNumberId;
    }

    static void RemapRelationships(
        OpenXmlElement cloned,
        OpenXmlPart sourcePart,
        OpenXmlPart destPart,
        Dictionary<string, string> relationshipIds)
    {
        foreach (var element in SelfAndDescendants(cloned))
        {
            foreach (var attribute in element.GetAttributes().ToList())
            {
                if (attribute.NamespaceUri != RelationshipNamespace || string.IsNullOrWhiteSpace(attribute.Value)) continue;
                var cacheKey = $"{sourcePart.Uri}\u0000{attribute.Value}";
                if (!relationshipIds.TryGetValue(cacheKey, out var targetId))
                {
                    targetId = CopyRelationship(sourcePart, destPart, attribute.Value);
                    relationshipIds[cacheKey] = targetId;
                }
                element.SetAttribute(new OpenXmlAttribute(
                    attribute.Prefix,
                    attribute.LocalName,
                    attribute.NamespaceUri,
                    targetId));
            }
        }
    }

    static string CopyRelationship(OpenXmlPart sourcePart, OpenXmlPart destPart, string relationshipId)
    {
        var hyperlink = sourcePart.HyperlinkRelationships.FirstOrDefault(item => item.Id == relationshipId);
        if (hyperlink is not null)
        {
            return destPart.AddHyperlinkRelationship(hyperlink.Uri, hyperlink.IsExternal).Id;
        }

        var external = sourcePart.ExternalRelationships.FirstOrDefault(item => item.Id == relationshipId);
        if (external is not null)
        {
            return destPart.AddExternalRelationship(external.RelationshipType, external.Uri).Id;
        }

        var relatedPart = sourcePart.Parts
            .Where(item => item.RelationshipId == relationshipId)
            .Select(item => item.OpenXmlPart)
            .FirstOrDefault();
        if (relatedPart is null)
        {
            throw new InvalidOperationException($"无法解析跨文档关系：{relationshipId}");
        }

        try
        {
            var copied = destPart.AddPart(relatedPart);
            return destPart.GetIdOfPart(copied);
        }
        catch (Exception exception)
        {
            throw new InvalidOperationException($"无法迁移跨文档关系：{relationshipId}", exception);
        }
    }

    static IEnumerable<OpenXmlElement> SelfAndDescendants(OpenXmlElement element)
    {
        yield return element;
        foreach (var descendant in element.Descendants()) yield return descendant;
    }

    sealed class CrossDocumentImportContext(Dictionary<string, string?> styleIds)
    {
        public Dictionary<string, string?> StyleIds { get; } = styleIds;
        public Dictionary<int, int> NumberingIds { get; } = [];
        public Dictionary<string, string> RelationshipIds { get; } = new(StringComparer.Ordinal);
    }
}
