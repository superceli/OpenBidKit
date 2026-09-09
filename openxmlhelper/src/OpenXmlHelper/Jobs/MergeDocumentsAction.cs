using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using System.IO;
using System.Diagnostics;
using Wp = DocumentFormat.OpenXml.Wordprocessing;

namespace Yibiao.OpenXmlHelper.Jobs;

sealed class MergeDocumentsRequest
{
    public string Action { get; set; } = "";
    public string CoverTemplate { get; set; } = "";
    /// <summary>签章页模板 docx 路径；提供则用模板填充替代代码生成。</summary>
    public string SigningPageTemplate { get; set; } = "";
    /// <summary>签章页表格边框颜色（如 dcdff6）；为空则保留模板原值。</summary>
    public string TableBorderColor { get; set; } = "";
    /// <summary>签章页表头背景色（如 eef5ff）；为空则保留模板原值。</summary>
    public string TableHeaderBg { get; set; } = "";
    public Dictionary<string, string> CoverFields { get; set; } = new();
    public string BodyDoc { get; set; } = "";
    public string Output { get; set; } = "";
    public FrontMatterRequest? FrontMatter { get; set; }
}

sealed class FrontMatterRequest
{
    public TitlePageRequest? TitlePage { get; set; }
    public TocPageRequest? Toc { get; set; }
    public SigningPageRequest? SigningPage { get; set; }
}

/// <summary>扉页：报告标题、副标题，以及委托单位/报告编号/编制日期/编制单位/公示平台等信息行。</summary>
sealed class TitlePageRequest
{
    public string Title { get; set; } = "";
    public string Subtitle { get; set; } = "";
    public List<FrontMatterParagraph> InfoRows { get; set; } = new();
}

sealed class FrontMatterPage
{
    public string Title { get; set; } = "";
    public List<FrontMatterParagraph> Paragraphs { get; set; } = new();
}

sealed class FrontMatterParagraph
{
    public string Label { get; set; } = "";
    public string Value { get; set; } = "";
}

sealed class TocPageRequest
{
    public string Title { get; set; } = "目录";
    public List<TocEntry> Entries { get; set; } = new();
}

sealed class TocEntry
{
    public int Level { get; set; } = 1;
    public string Title { get; set; } = "";
    public string Page { get; set; } = "";
}

sealed class SigningPageRequest
{
    public string Title { get; set; } = "";
    public string Preamble { get; set; } = "";
    public List<SigningInfoRow> InfoRows { get; set; } = new();
    public SigningParty ClientParty { get; set; } = new();
    public SigningParty PrepareParty { get; set; } = new();
    /// <summary>表头背景色（HEX，不带#），来自导出模板配置；为空时用默认浅蓝 D9E2F3。</summary>
    public string? HeaderShading { get; set; }
}

sealed class SigningInfoRow
{
    public string Label { get; set; } = "";
    public string Value { get; set; } = "";
}

sealed class SigningParty
{
    public string Header { get; set; } = "";
    public string UnitName { get; set; } = "";
    public string SealHint { get; set; } = "（此处加盖单位公章）";
    public string SignatureLabel { get; set; } = "法定代表人/授权代表（签字）：";
    public string DateLabel { get; set; } = "日期：";
}

/// <summary>把封面 docx 的两个 section（封面、尾页）插入到正文 docx 前后，并回显封面字段。</summary>
static class MergeDocumentsAction
{
    public const string Name = "merge-documents";
    const string RelationshipNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    static readonly string DiagLogPath = Path.Combine(Path.GetTempPath(), "merge-diag.log");

    static void Diag(string msg)
    {
        var line = $"[{DateTime.Now:HH:mm:ss}] {msg}{Environment.NewLine}";
        File.AppendAllText(DiagLogPath, line);
        Console.Error.WriteLine(msg);
    }

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
            Diag($"[merge] Cover frontBlocks: {frontBlocks.Count}, frontSectPr: {frontSectPr is not null}");
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
                insertPos++;
            }

            // 插入前置页（编制说明、目录、签章页），位于封面之后、正文之前
            Diag($"[merge] FrontMatter is null? {request.FrontMatter is null}");
            if (request.FrontMatter is not null)
            {
                Diag($"[merge] TitlePage={request.FrontMatter.TitlePage is not null}, Toc={request.FrontMatter.Toc is not null}, SigningPage={request.FrontMatter.SigningPage is not null}");
                Diag($"[merge] SigningPageTemplate='{request.SigningPageTemplate}', exists={(!string.IsNullOrWhiteSpace(request.SigningPageTemplate) && File.Exists(request.SigningPageTemplate))}");
                Diag($"[merge] TableBorderColor='{request.TableBorderColor}', TableHeaderBg='{request.TableHeaderBg}'");

                // 1. 扉页 + 目录：代码生成
                var frontMatterBlocks = BuildFrontMatterBlocksExceptSigning(request.FrontMatter);
                Diag($"[merge] FrontMatterExceptSigning blocks: {frontMatterBlocks.Count}");
                foreach (var block in frontMatterBlocks)
                {
                    destBody.InsertAt(block, insertPos);
                    insertPos++;
                }

                // 2. 签章页：优先用模板填充，没有模板才代码生成
                if (request.FrontMatter.SigningPage is not null)
                {
                    IEnumerable<OpenXmlElement> signingBlocks;
                    if (!string.IsNullOrWhiteSpace(request.SigningPageTemplate) && File.Exists(request.SigningPageTemplate))
                    {
                        Diag("[merge] Using signing page template");
                        signingBlocks = BuildSigningPageFromTemplate(request.SigningPageTemplate, request.FrontMatter.SigningPage, request.TableBorderColor, request.TableHeaderBg);
                    }
                    else
                    {
                        Diag("[merge] Using code-generated signing page");
                        signingBlocks = BuildSigningPage(request.FrontMatter.SigningPage);
                    }
                    var signingList = signingBlocks.ToList();
                    Diag($"[merge] Signing blocks: {signingList.Count}");
                    foreach (var block in signingList)
                    {
                        destBody.InsertAt(block, insertPos);
                        insertPos++;
                    }
                    // 签章页后加分页符，让正文从新页开始
                    destBody.InsertAt(MakePageBreakParagraph(), insertPos);
                    insertPos++;
                }
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

            // 让 Word 打开时自动更新目录域（页码），且不弹出"是否更新域"提示框
            EnableUpdateFieldsOnOpen(destPart);

            destPart.Document.Save();
            // 诊断：统计最终 body 里的段落/表格/sectPr 数量
            var finalParas = destBody.Elements<Wp.Paragraph>().Count();
            var finalTables = destBody.Elements<Wp.Table>().Count();
            var finalSectPr = destBody.Elements<Wp.SectionProperties>().Count();
            Diag($"[merge] SAVE OK. body: paras={finalParas}, tables={finalTables}, sectPr={finalSectPr}");
            return JobResult.Success(Name, outputPath);
        }
        catch (Exception exception)
        {
            Diag($"[merge] ERROR: {exception.Message}{Environment.NewLine}{exception.StackTrace}");
            return JobResult.Fail(exception.Message);
        }
    }

    /// <summary>
    /// 在文档 settings.xml 中设置 updateFields=true 与 doNotPromptForUpdateFields=true，
    /// 使 Word 打开时自动更新目录域（页码）且不弹出确认提示。
    /// </summary>
    static void EnableUpdateFieldsOnOpen(MainDocumentPart destPart)
    {
        const string W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
        var settingsPart = destPart.DocumentSettingsPart ?? destPart.AddNewPart<DocumentSettingsPart>();
        var settings = settingsPart.Settings;
        var isNew = settings is null;
        if (isNew)
        {
            settings = new Wp.Settings();
        }
        // 移除已有的同名设置，避免重复
        foreach (var child in settings!.ChildElements.ToList())
        {
            var local = child.LocalName;
            if (local == "updateFields" || local == "doNotPromptForUpdateFields")
            {
                child.Remove();
            }
        }
        // 直接在 settings 根节点注入两个开关元素（OpenXML SDK 3.x 无对应强类型）
        settings.InnerXml = $"<w:updateFields w:val=\"true\" xmlns:w=\"{W_NS}\"/><w:doNotPromptForUpdateFields w:val=\"true\" xmlns:w=\"{W_NS}\"/>" + settings.InnerXml;
        if (isNew)
        {
            // 新建的 Settings 才需要关联到 Part；已有 Settings 重新赋值会报"已关联到其他 Part"
            settingsPart.Settings = settings;
        }
        else
        {
            settings.Save();
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
            // 字段值继承标签 run 的字体/字号属性，不加粗
            var props = (Wp.RunProperties)lastRun.RunProperties.CloneNode(true);
            // 显式移除加粗，确保字段值和标签样式一致
            props.GetFirstChild<Wp.Bold>()?.Remove();
            props.GetFirstChild<Wp.BoldComplexScript>()?.Remove();
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

    // ===== 前置页生成（编制说明、目录、签章页）=====

    /// <summary>按顺序生成三个前置页的 blocks，每页末尾加分页符。</summary>
    static List<OpenXmlElement> BuildFrontMatterBlocks(FrontMatterRequest frontMatter)
    {
        var blocks = BuildFrontMatterBlocksExceptSigning(frontMatter);
        // 签章页
        if (frontMatter.SigningPage is not null)
        {
            blocks.AddRange(BuildSigningPage(frontMatter.SigningPage));
            blocks.Add(MakePageBreakParagraph());
        }
        return blocks;
    }

    /// <summary>只生成扉页 + 目录（不含签章页），签章页由调用方单独处理。</summary>
    static List<OpenXmlElement> BuildFrontMatterBlocksExceptSigning(FrontMatterRequest frontMatter)
    {
        var blocks = new List<OpenXmlElement>();
        // 1. 扉页（封面后第一页）
        if (frontMatter.TitlePage is not null)
        {
            blocks.AddRange(BuildTitlePage(frontMatter.TitlePage));
            blocks.Add(MakePageBreakParagraph());
        }
        // 2. 目录
        if (frontMatter.Toc is not null)
        {
            blocks.AddRange(BuildTocPage(frontMatter.Toc));
            blocks.Add(MakePageBreakParagraph());
        }
        return blocks;
    }

    /// <summary>从签章页模板 docx 填充字段后克隆内容返回，覆盖表格样式。</summary>
    static List<OpenXmlElement> BuildSigningPageFromTemplate(string templatePath, SigningPageRequest signing, string? borderColor = null, string? headerBg = null)
    {
        using var template = WordprocessingDocument.Open(templatePath, false);
        var templateBody = template.MainDocumentPart?.Document.Body;
        if (templateBody is null) return BuildSigningPage(signing);

        // 克隆模板所有段落和表格
        var blocks = new List<OpenXmlElement>();
        foreach (var child in templateBody.ChildElements)
        {
            blocks.Add((OpenXmlElement)child.CloneNode(true));
        }

        // 覆盖表格样式（边框色、表头背景）
        if (!string.IsNullOrWhiteSpace(borderColor) || !string.IsNullOrWhiteSpace(headerBg))
        {
            ApplyTableStylesToBlocks(blocks, borderColor, headerBg);
        }

        // 填充字段
        FillSigningTemplateFields(blocks, signing);
        return blocks;
    }

    /// <summary>覆盖表格样式（边框色、表头背景色）。</summary>
    static void ApplyTableStylesToBlocks(List<OpenXmlElement> blocks, string? borderColor, string? headerBg)
    {
        foreach (var block in blocks)
        {
            if (block is not Wp.Table table) continue;

            // === 1. 覆盖表格级边框 ===
            if (!string.IsNullOrWhiteSpace(borderColor))
            {
                // 清除所有单元格级边框（TcBorders），否则会覆盖表格级边框
                foreach (var cell in table.Elements<Wp.TableRow>().SelectMany(r => r.Elements<Wp.TableCell>()))
                {
                    var tcPr = cell.GetFirstChild<Wp.TableCellProperties>();
                    tcPr?.GetFirstChild<Wp.TableCellBorders>()?.Remove();
                }

                var tblPr = table.GetFirstChild<Wp.TableProperties>() ?? table.AppendChild(new Wp.TableProperties());
                var oldBorders = tblPr.GetFirstChild<Wp.TableBorders>();
                oldBorders?.Remove();
                var newBorders = new Wp.TableBorders(
                    new Wp.TopBorder { Val = Wp.BorderValues.Single, Color = borderColor, Size = 4 },
                    new Wp.LeftBorder { Val = Wp.BorderValues.Single, Color = borderColor, Size = 4 },
                    new Wp.BottomBorder { Val = Wp.BorderValues.Single, Color = borderColor, Size = 4 },
                    new Wp.RightBorder { Val = Wp.BorderValues.Single, Color = borderColor, Size = 4 },
                    new Wp.InsideHorizontalBorder { Val = Wp.BorderValues.Single, Color = borderColor, Size = 4 },
                    new Wp.InsideVerticalBorder { Val = Wp.BorderValues.Single, Color = borderColor, Size = 4 }
                );
                tblPr.AppendChild(newBorders);
            }

            // === 2. 覆盖表头行单元格背景色 ===
            if (!string.IsNullOrWhiteSpace(headerBg))
            {
                var firstRow = table.Elements<Wp.TableRow>().FirstOrDefault();
                if (firstRow is not null)
                {
                    foreach (var cell in firstRow.Elements<Wp.TableCell>())
                    {
                        var tcPr = cell.GetFirstChild<Wp.TableCellProperties>() ?? cell.AppendChild(new Wp.TableCellProperties());
                        var oldShd = tcPr.GetFirstChild<Wp.Shading>();
                        oldShd?.Remove();
                        tcPr.AppendChild(new Wp.Shading { Fill = headerBg, Val = Wp.ShadingPatternValues.Clear });
                    }
                }
            }
        }
    }

    /// <summary>在签章页模板 blocks 中查找并填充空白字段。</summary>
    static void FillSigningTemplateFields(List<OpenXmlElement> blocks, SigningPageRequest signing)
    {
        // 收集所有段落和表格
        var allParas = new List<Wp.Paragraph>();
        var allTables = new List<Wp.Table>();
        foreach (var block in blocks)
        {
            if (block is Wp.Paragraph p) allParas.Add(p);
            else if (block is Wp.Table t) allTables.Add(t);
            else if (block is Wp.SectionProperties) { /* skip */ }
        }

        // === 1. 填充说明段落中的委托单位 ===
        // 模板原文："本报告由 安徽蔚碳环保科技有限公司 接受 东方工建集团有限公司 委托..."
        // 把两个公司名替换成实际值
        var preamblePara = allParas.FirstOrDefault(p => ReadDirectRunText(p).StartsWith("本报告由"));
        if (preamblePara is not null && !string.IsNullOrWhiteSpace(signing.Preamble))
        {
            ReplaceParagraphText(preamblePara, signing.Preamble);
        }

        // === 2. 填充信息表（第一个表格）===
        if (allTables.Count >= 1)
        {
            FillSigningInfoTable(allTables[0], signing.InfoRows);
        }

        // === 3. 填充签章表（第二个表格）===
        if (allTables.Count >= 2)
        {
            FillSigningPartyTable(allTables[1], signing.ClientParty, signing.PrepareParty);
        }
    }

    /// <summary>替换段落所有文本，保留第一个 Run 的样式，强制覆盖字号为小四（12pt=24 half-pts），表格内单倍行距。</summary>
    static void ReplaceParagraphText(Wp.Paragraph para, string newText, int sizeHalfPt = 24)
    {
        // 收集第一个 Run 的样式
        var firstRun = para.Elements<Wp.Run>().FirstOrDefault();
        var runProps = firstRun?.RunProperties?.CloneNode(true) as Wp.RunProperties;

        // 强制覆盖字号
        if (runProps is null) runProps = new Wp.RunProperties();
        runProps.FontSize = new Wp.FontSize { Val = new StringValue(sizeHalfPt.ToString()) };
        runProps.FontSizeComplexScript = new Wp.FontSizeComplexScript { Val = new StringValue(sizeHalfPt.ToString()) };

        // 强制段落 spacing：单倍行距 + 段前段后 0
        var pPr = para.GetFirstChild<Wp.ParagraphProperties>() ?? para.AppendChild(new Wp.ParagraphProperties());
        var oldSpacing = pPr.GetFirstChild<Wp.SpacingBetweenLines>();
        oldSpacing?.Remove();
        pPr.AppendChild(new Wp.SpacingBetweenLines
        {
            Before = "0",
            After = "0",
            Line = "240",
            LineRule = Wp.LineSpacingRuleValues.Auto,
        });

        // 移除所有 Run
        foreach (var run in para.Elements<Wp.Run>().ToList()) run.Remove();

        // 创建新 Run
        var newRun = new Wp.Run();
        newRun.RunProperties = runProps;
        newRun.AppendChild(new Wp.Text(newText) { Space = SpaceProcessingModeValues.Preserve });
        para.AppendChild(newRun);
    }

    /// <summary>填充信息表：按第一列的 label 匹配，把第二列空白/占位内容替换成 value。</summary>
    static void FillSigningInfoTable(Wp.Table table, List<SigningInfoRow> infoRows)
    {
        foreach (var row in table.Elements<Wp.TableRow>())
        {
            var cells = row.Elements<Wp.TableCell>().ToList();
            if (cells.Count < 2) continue;
            var label = GetCellPlainText(cells[0]).Trim();
            var value = GetCellPlainText(cells[1]).Trim();

            // 跳过表头行
            if (label is "项目" or "项目" && value is "内容") continue;
            // 如果第二列已有内容（非空白非模板默认值），跳过
            if (!string.IsNullOrEmpty(value) && !value.StartsWith("2026")) continue;

            // 查找匹配的 infoRow
            var match = infoRows.FirstOrDefault(r => r.Label == label);
            if (match is not null && !string.IsNullOrEmpty(match.Value))
            {
                ReplaceParagraphText(cells[1].Elements<Wp.Paragraph>().First(), match.Value);
            }
        }
    }

    /// <summary>填充签章表：按单元格序号填充委托单位（左）和编制单位（右）。</summary>
    static void FillSigningPartyTable(Wp.Table table, SigningParty? client, SigningParty? prepare)
    {
        // 签章表第一行是表头（委托单位盖章/编制单位盖章），签章内容在最后一行
        var row = table.Elements<Wp.TableRow>().LastOrDefault();
        if (row is null) return;
        var cells = row.Elements<Wp.TableCell>().ToList();
        if (cells.Count < 2) return;

        FillSigningPartyCell(cells[0], client, signingPartyIsClient: true);
        FillSigningPartyCell(cells[1], prepare, signingPartyIsClient: false);
    }

    /// <summary>填充签章单元格：单位名称、日期，并设置各段之间的留白。</summary>
    static void FillSigningPartyCell(Wp.TableCell cell, SigningParty? party, bool signingPartyIsClient)
    {
        if (party is null) return;
        var paras = cell.Elements<Wp.Paragraph>().ToList();
        if (paras.Count < 1) return;

        // 遍历每个段落，按内容类型设置文本和留白
        foreach (var p in paras)
        {
            var text = ReadDirectRunText(p);

            if (text.StartsWith("单位名称") || text.StartsWith("单位名称："))
            {
                ReplaceParagraphText(p, $"单位名称：{party.UnitName}");
                SetParaSpacing(p, before: "120", after: "120");
            }
            else if (text.Contains("此处加盖") || text.Contains("公章"))
            {
                ReplaceParagraphText(p, party.SealHint);
                SetParaSpacing(p, before: "400", after: "400");
            }
            else if (text.Contains("法定代表人") || text.Contains("授权代表") || text.Contains("签字"))
            {
                ReplaceParagraphText(p, party.SignatureLabel);
                SetParaSpacing(p, before: "0", after: "200");
            }
            else if (text.Contains("日期"))
            {
                ReplaceParagraphText(p, party.DateLabel);
                SetParaSpacing(p, before: "200", after: "120");
            }
        }
    }

    /// <summary>设置段落的段前段后间距（twips）。</summary>
    static void SetParaSpacing(Wp.Paragraph para, string? before = null, string? after = null, string? line = null)
    {
        var pPr = para.GetFirstChild<Wp.ParagraphProperties>() ?? para.AppendChild(new Wp.ParagraphProperties());
        var spacing = pPr.GetFirstChild<Wp.SpacingBetweenLines>() ?? pPr.AppendChild(new Wp.SpacingBetweenLines());
        if (before is not null) spacing.Before = before;
        if (after is not null) spacing.After = after;
        if (line is not null) { spacing.Line = line; spacing.LineRule = Wp.LineSpacingRuleValues.Auto; }
    }

    /// <summary>获取单元格内所有段落的纯文本拼接。</summary>
    static string GetCellPlainText(Wp.TableCell cell)
    {
        var texts = new List<string>();
        foreach (var p in cell.Elements<Wp.Paragraph>())
        {
            var t = ReadDirectRunText(p);
            if (!string.IsNullOrEmpty(t)) texts.Add(t);
        }
        return string.Join(" ", texts);
    }

    /// <summary>扉页：标题居中加粗 + 副标题居中，下方信息行左对齐（委托单位/报告编号/编制日期/编制单位/公示平台）。</summary>
    static List<OpenXmlElement> BuildTitlePage(TitlePageRequest page)
    {
        var blocks = new List<OpenXmlElement>();
        // 顶部留白：用空行把标题推到页面约 1/3 处
        for (var i = 0; i < 6; i++) blocks.Add(MakeEmptyParagraph());
        // 主标题：居中、加粗、二号字（44 half pt = 22pt）
        blocks.Add(MakeParagraph(page.Title, centered: true, bold: true, sizeHalfPt: 44));
        // 副标题：居中、小四（24 half pt）
        if (!string.IsNullOrEmpty(page.Subtitle))
        {
            blocks.Add(MakeEmptyParagraph());
            blocks.Add(MakeParagraph(page.Subtitle, centered: true, sizeHalfPt: 24));
        }
        // 中部留白：把信息行推到页面下方（靠近底部）
        for (var i = 0; i < 22; i++) blocks.Add(MakeEmptyParagraph());
        // 信息行：左对齐，宋体小四（24 half pt），1.5 倍行距
        foreach (var row in page.InfoRows)
        {
            var text = string.IsNullOrEmpty(row.Label)
                ? row.Value
                : $"{row.Label}：{row.Value}";
            blocks.Add(MakeParagraph(text, sizeHalfPt: 24, lineSpacing: 480));
        }
        return blocks;
    }

    /// <summary>编制说明页：标题居中加粗 + 正文段落（宋体小四首行缩进、1.5倍行距）。</summary>
    static List<OpenXmlElement> BuildCompilationNotesPage(FrontMatterPage page)
    {
        var blocks = new List<OpenXmlElement>
        {
            MakeParagraph(page.Title, centered: true, bold: true, sizeHalfPt: 36),
            MakeEmptyParagraph(),
        };
        foreach (var para in page.Paragraphs)
        {
            var text = string.IsNullOrEmpty(para.Label)
                ? para.Value
                : $"{para.Label}：{para.Value}";
            blocks.Add(MakeParagraph(text, sizeHalfPt: 24, firstLineIndent: 480, lineSpacing: 480));
        }
        return blocks;
    }

    /// <summary>目录页：标题 + 静态目录条目（带点引线和页码，无需 Word 更新域）。</summary>
    static List<OpenXmlElement> BuildTocPage(TocPageRequest toc)
    {
        var blocks = new List<OpenXmlElement>
        {
            MakeParagraph(toc.Title, centered: true, bold: true, sizeHalfPt: 36),
            MakeEmptyParagraph(),
        };
        // 直接渲染静态目录条目，不使用 TOC 域（避免需要手动更新域）
        foreach (var entry in toc.Entries ?? new List<TocEntry>())
        {
            blocks.Add(BuildTocEntryParagraph(entry));
        }
        return blocks;
    }

    /// <summary>构建 Word TOC 域段落：打开文档时自动更新目录及页码。</summary>
    static Wp.Paragraph BuildTocFieldParagraph()
    {
        const string W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
        var para = new Wp.Paragraph();
        // fldChar begin — 加 dirty="true" 强制 Word 打开时更新该域
        para.AppendChild(new Wp.Run(new Wp.FieldChar { FieldCharType = Wp.FieldCharValues.Begin, Dirty = true }));
        // instrText: 直接构造原始 XML，确保生成 <w:instrText> 而非 <w:fieldCode>
        var instrRun = new Wp.Run();
        instrRun.InnerXml = $"<w:instrText xml:space=\"preserve\" xmlns:w=\"{W_NS}\"> TOC \\o \"1-3\" \\h \\z \\u </w:instrText>";
        para.AppendChild(instrRun);
        // fldChar separate
        para.AppendChild(new Wp.Run(new Wp.FieldChar { FieldCharType = Wp.FieldCharValues.Separate }));
        // 占位提示文字（Word 打开时自动更新目录及页码）
        para.AppendChild(MakeRun("正在生成目录，请稍候...", sizeHalfPt: 22));
        // fldChar end
        para.AppendChild(new Wp.Run(new Wp.FieldChar { FieldCharType = Wp.FieldCharValues.End }));
        return para;
    }

    /// <summary>目录条目段落：书籍式目录，层级缩进，点引线+页码右对齐。</summary>
    static Wp.Paragraph BuildTocEntryParagraph(TocEntry entry)
    {
        var level = Math.Max(1, Math.Min(entry.Level, 6));
        var isChapter = level == 1;
        // 一级不缩进，二级缩进 360，三级缩进 720，以此类推
        var leftIndent = (level - 1) * 360;
        var para = new Wp.Paragraph();
        var pPr = new Wp.ParagraphProperties();

        if (isChapter)
        {
            // 章标题：段前 200 段后 60，行距 1.5 倍
            pPr.AppendChild(new Wp.SpacingBetweenLines { Before = "200", After = "60", Line = "360", LineRule = Wp.LineSpacingRuleValues.Auto });
        }
        else
        {
            // 节/小节标题：紧凑间距
            pPr.AppendChild(new Wp.SpacingBetweenLines { Before = "30", After = "30", Line = "320", LineRule = Wp.LineSpacingRuleValues.Auto });
        }

        if (leftIndent > 0)
        {
            pPr.AppendChild(new Wp.Indentation { Left = new StringValue(leftIndent.ToString()) });
        }
        // 制表符右对齐（9000 twips 处），点引线
        pPr.AppendChild(new Wp.Tabs(
            new Wp.TabStop { Val = Wp.TabStopValues.Right, Position = 9000, Leader = Wp.TabStopLeaderCharValues.Dot }
        ));
        para.AppendChild(pPr);
        // 章标题小四加粗(28)，节标题五号(21)，小节五号(21)
        var size = isChapter ? 28 : 21;
        var titleRun = MakeRun(entry.Title, sizeHalfPt: size, bold: isChapter);
        para.AppendChild(titleRun);
        // 制表符+点引线+页码
        para.AppendChild(new Wp.Run(new Wp.TabChar()));
        if (!string.IsNullOrEmpty(entry.Page))
        {
            para.AppendChild(MakeRun(entry.Page, sizeHalfPt: size, bold: isChapter));
        }
        return para;
    }

    /// <summary>签章页：标题 + 描述段落 + 小标题 + 信息表(表头背景色) + 小标题 + 双列签章表。</summary>
    static List<OpenXmlElement> BuildSigningPage(SigningPageRequest signing)
    {
        var headerShading = string.IsNullOrWhiteSpace(signing.HeaderShading) ? "D9E2F3" : signing.HeaderShading;
        var blocks = new List<OpenXmlElement>
        {
            MakeParagraph(signing.Title, centered: true, bold: true, sizeHalfPt: 44),
            MakeEmptyParagraph(),
        };
        if (!string.IsNullOrEmpty(signing.Preamble))
        {
            blocks.Add(MakeParagraph(signing.Preamble, sizeHalfPt: 28, firstLineIndent: 480, lineSpacing: 480));
            blocks.Add(MakeEmptyParagraph());
        }

        // 信息表
        if (signing.InfoRows.Count > 0)
        {
            blocks.Add(MakeParagraph("编制单位信息如下：", bold: true, sizeHalfPt: 28));
            blocks.Add(MakeEmptyParagraph());
            blocks.Add(BuildInfoTable(signing.InfoRows, headerShading));
            blocks.Add(MakeEmptyParagraph());
        }

        // 签章表（双列：委托单位 | 编制单位）
        if (!string.IsNullOrEmpty(signing.ClientParty?.Header) || !string.IsNullOrEmpty(signing.PrepareParty?.Header))
        {
            blocks.Add(MakeParagraph("以下为第三方机构及委托方签字盖章位置：", bold: true, sizeHalfPt: 28));
            blocks.Add(MakeEmptyParagraph());
            blocks.Add(BuildSignatureTable(signing.ClientParty, signing.PrepareParty, headerShading));
        }

        return blocks;
    }

    /// <summary>构建信息表格：2 列，表头（项目/内容）带背景色，全部文字居中，表格占满正文宽度。</summary>
    static Wp.Table BuildInfoTable(List<SigningInfoRow> rows, string headerShading)
    {
        const int col1 = 2600;
        const int col2 = 6600;
        var table = new Wp.Table();
        var tblPr = new Wp.TableProperties(
            new Wp.TableWidth { Type = Wp.TableWidthUnitValues.Dxa, Width = (col1 + col2).ToString() },
            new Wp.TableJustification { Val = Wp.TableRowAlignmentValues.Center },
            new Wp.TableBorders(
                new Wp.TopBorder { Val = Wp.BorderValues.Single, Size = 4, Color = "000000" },
                new Wp.LeftBorder { Val = Wp.BorderValues.Single, Size = 4, Color = "000000" },
                new Wp.BottomBorder { Val = Wp.BorderValues.Single, Size = 4, Color = "000000" },
                new Wp.RightBorder { Val = Wp.BorderValues.Single, Size = 4, Color = "000000" },
                new Wp.InsideHorizontalBorder { Val = Wp.BorderValues.Single, Size = 4, Color = "000000" },
                new Wp.InsideVerticalBorder { Val = Wp.BorderValues.Single, Size = 4, Color = "000000" }
            ),
            new Wp.TableCellMargin(
                new Wp.TopMargin { Width = "120", Type = Wp.TableWidthUnitValues.Dxa },
                new Wp.LeftMargin { Width = "200", Type = Wp.TableWidthUnitValues.Dxa },
                new Wp.BottomMargin { Width = "120", Type = Wp.TableWidthUnitValues.Dxa },
                new Wp.RightMargin { Width = "200", Type = Wp.TableWidthUnitValues.Dxa }
            )
        );
        table.AppendChild(tblPr);

        var grid = new Wp.TableGrid(
            new Wp.GridColumn { Width = col1.ToString() },
            new Wp.GridColumn { Width = col2.ToString() }
        );
        table.AppendChild(grid);

        // 表头行（背景色来自模板配置）
        var headerRow = new Wp.TableRow();
        headerRow.AppendChild(MakeCell("项目", widthTwips: col1, bold: true, centered: true, shading: headerShading, sizeHalfPt: 28));
        headerRow.AppendChild(MakeCell("内容", widthTwips: col2, bold: true, centered: true, shading: headerShading, sizeHalfPt: 28));
        table.AppendChild(headerRow);

        foreach (var row in rows)
        {
            var tr = new Wp.TableRow();
            tr.AppendChild(MakeCell(row.Label, widthTwips: col1, bold: true, centered: true, sizeHalfPt: 28));
            tr.AppendChild(MakeCell(row.Value, widthTwips: col2, centered: true, sizeHalfPt: 28));
            table.AppendChild(tr);
        }
        return table;
    }

    /// <summary>构建双列签章表格：仅 1 行 2 列，左右单元格内用段落排列内容，外框+中间竖线全部实线。</summary>
    static Wp.Table BuildSignatureTable(SigningParty? client, SigningParty? prepare, string headerShading)
    {
        const int colW = 4600;
        var table = new Wp.Table();
        var tblPr = new Wp.TableProperties(
            new Wp.TableWidth { Type = Wp.TableWidthUnitValues.Dxa, Width = (colW * 2).ToString() },
            new Wp.TableJustification { Val = Wp.TableRowAlignmentValues.Center },
            new Wp.TableBorders(
                new Wp.TopBorder { Val = Wp.BorderValues.Single, Size = 4, Color = "000000" },
                new Wp.LeftBorder { Val = Wp.BorderValues.Single, Size = 4, Color = "000000" },
                new Wp.BottomBorder { Val = Wp.BorderValues.Single, Size = 4, Color = "000000" },
                new Wp.RightBorder { Val = Wp.BorderValues.Single, Size = 4, Color = "000000" },
                new Wp.InsideVerticalBorder { Val = Wp.BorderValues.Single, Size = 4, Color = "000000" }
            ),
            new Wp.TableCellMargin(
                new Wp.TopMargin { Width = "40", Type = Wp.TableWidthUnitValues.Dxa },
                new Wp.LeftMargin { Width = "200", Type = Wp.TableWidthUnitValues.Dxa },
                new Wp.BottomMargin { Width = "40", Type = Wp.TableWidthUnitValues.Dxa },
                new Wp.RightMargin { Width = "200", Type = Wp.TableWidthUnitValues.Dxa }
            )
        );
        table.AppendChild(tblPr);

        var grid = new Wp.TableGrid(
            new Wp.GridColumn { Width = colW.ToString() },
            new Wp.GridColumn { Width = colW.ToString() }
        );
        table.AppendChild(grid);

        // 单行双列，每列一个单元格
        var row = new Wp.TableRow();
        row.AppendChild(BuildSignatureCell(client, colW, headerShading));
        row.AppendChild(BuildSignatureCell(prepare, colW, headerShading));
        table.AppendChild(row);

        return table;
    }

    /// <summary>构建签章单元格：表头铺满宽度无内边距，内容有左右内边距。</summary>
    static Wp.TableCell BuildSignatureCell(SigningParty? party, int colW, string headerShading)
    {
        const int padTop = 0;
        const int padBottom = 120;
        const string contentIndent = "300";

        var cell = new Wp.TableCell();
        // 单元格左右边距为0，让表头背景铺满到边框
        var cellProps = new Wp.TableCellProperties(
            new Wp.TableCellWidth { Type = Wp.TableWidthUnitValues.Dxa, Width = new StringValue(colW.ToString()) },
            new Wp.TableCellMargin(
                new Wp.TopMargin { Width = padTop.ToString(), Type = Wp.TableWidthUnitValues.Dxa },
                new Wp.LeftMargin { Width = "0", Type = Wp.TableWidthUnitValues.Dxa },
                new Wp.BottomMargin { Width = padBottom.ToString(), Type = Wp.TableWidthUnitValues.Dxa },
                new Wp.RightMargin { Width = "0", Type = Wp.TableWidthUnitValues.Dxa }
            )
        );
        cell.AppendChild(cellProps);

        // 表头段落：居中、加粗、背景色铺满、零间距、底边框
        var headerPara = new Wp.Paragraph();
        var headerParaPr = new Wp.ParagraphProperties(
            new Wp.Justification { Val = Wp.JustificationValues.Center },
            new Wp.Indentation { Left = "0", Right = "0" },
            new Wp.SpacingBetweenLines { Before = "0", After = "0", Line = "240", LineRule = Wp.LineSpacingRuleValues.Auto },
            new Wp.Shading { Fill = headerShading },
            new Wp.ParagraphBorders(
                new Wp.BottomBorder { Val = Wp.BorderValues.Single, Size = 4u, Color = "000000" }
            )
        );
        headerPara.AppendChild(headerParaPr);
        headerPara.AppendChild(MakeRun(party?.Header ?? "（盖章）", 24, true));
        cell.AppendChild(headerPara);

        // 内容段落：左右缩进200作为内边距，各段之间预留盖章留白
        cell.AppendChild(MakeParagraph($"单位名称：{party?.UnitName ?? ""}", sizeHalfPt: 24, indentation: contentIndent, rightIndentation: contentIndent, spacingBefore: "120", spacingAfter: "120"));

        var sealPara = new Wp.Paragraph(
            new Wp.ParagraphProperties(
                new Wp.SpacingBetweenLines { Before = "400", After = "400" },
                new Wp.Indentation { Left = contentIndent, Right = contentIndent }
            )
        );
        sealPara.AppendChild(MakeRun(party?.SealHint ?? "（此处加盖单位公章）", 24, false));
        cell.AppendChild(sealPara);

        cell.AppendChild(MakeParagraph(party?.SignatureLabel ?? "法定代表人/授权代表（签字）：", sizeHalfPt: 24, indentation: contentIndent, rightIndentation: contentIndent, spacingBefore: "0", spacingAfter: "200"));

        cell.AppendChild(MakeParagraph(party?.DateLabel ?? "日期：", sizeHalfPt: 24, indentation: contentIndent, rightIndentation: contentIndent, spacingBefore: "200", spacingAfter: "120"));

        return cell;
    }

    /// <summary>工厂方法：生成带字体/字号/对齐/加粗/首行缩进/行距/左缩进/右缩进/段前段后间距的段落。</summary>
    static Wp.Paragraph MakeParagraph(string text, bool centered = false, bool bold = false, int sizeHalfPt = 24, int? firstLineIndent = null, int? lineSpacing = null, string? indentation = null, string? rightIndentation = null, string? spacingBefore = null, string? spacingAfter = null)
    {
        var pPr = new Wp.ParagraphProperties();
        if (centered)
        {
            pPr.AppendChild(new Wp.Justification { Val = Wp.JustificationValues.Center });
        }
        if (firstLineIndent is not null)
        {
            pPr.AppendChild(new Wp.Indentation { FirstLine = new StringValue(firstLineIndent.Value.ToString()) });
        }
        if (indentation is not null || rightIndentation is not null)
        {
            var ind = new Wp.Indentation();
            if (indentation is not null) ind.Left = indentation;
            if (rightIndentation is not null) ind.Right = rightIndentation;
            pPr.AppendChild(ind);
        }
        if (lineSpacing is not null || spacingBefore is not null || spacingAfter is not null)
        {
            var spacing = new Wp.SpacingBetweenLines();
            if (lineSpacing is not null)
            {
                spacing.Line = new StringValue(lineSpacing.Value.ToString());
                spacing.LineRule = Wp.LineSpacingRuleValues.Auto;
            }
            if (spacingBefore is not null) spacing.Before = spacingBefore;
            if (spacingAfter is not null) spacing.After = spacingAfter;
            pPr.AppendChild(spacing);
        }
        var run = MakeRun(text, sizeHalfPt, bold);
        var para = new Wp.Paragraph(pPr);
        para.AppendChild(run);
        return para;
    }

    /// <summary>工厂方法：生成空段落（占位）。</summary>
    static Wp.Paragraph MakeEmptyParagraph()
    {
        return new Wp.Paragraph();
    }

    /// <summary>工厂方法：生成分页符段落。</summary>
    static Wp.Paragraph MakePageBreakParagraph()
    {
        var para = new Wp.Paragraph();
        var run = new Wp.Run(new Wp.Break { Type = Wp.BreakValues.Page });
        para.AppendChild(run);
        return para;
    }

    /// <summary>工厂方法：生成 Run，双字体（中文宋体/西文 Times New Roman）。</summary>
    static Wp.Run MakeRun(string text, int sizeHalfPt, bool bold = false)
    {
        var run = new Wp.Run();
        var props = new Wp.RunProperties();
        if (bold)
        {
            props.AppendChild(new Wp.Bold());
            props.AppendChild(new Wp.BoldComplexScript());
        }
        props.AppendChild(new Wp.RunFonts { EastAsia = "宋体", Ascii = "Times New Roman", HighAnsi = "Times New Roman" });
        props.AppendChild(new Wp.FontSize { Val = new StringValue(sizeHalfPt.ToString()) });
        props.AppendChild(new Wp.FontSizeComplexScript { Val = new StringValue(sizeHalfPt.ToString()) });
        run.AppendChild(props);
        run.AppendChild(new Wp.Text(text) { Space = SpaceProcessingModeValues.Preserve });
        return run;
    }

    /// <summary>工厂方法：生成表格单元格（指定宽度、可选加粗/居中/背景色/各边边框）。</summary>
    static Wp.TableCell MakeCell(string text, int widthTwips, bool bold = false, bool centered = false, string? shading = null, int sizeHalfPt = 24,
        bool borderTop = false, bool borderBottom = false, bool borderLeft = false, bool borderRight = false)
    {
        var cell = new Wp.TableCell();
        var cellProps = new Wp.TableCellProperties(
            new Wp.TableCellWidth { Type = Wp.TableWidthUnitValues.Dxa, Width = new StringValue(widthTwips.ToString()) }
        );
        if (!string.IsNullOrEmpty(shading))
        {
            cellProps.AppendChild(new Wp.Shading { Fill = shading });
        }
        if (borderTop || borderBottom || borderLeft || borderRight)
        {
            var borders = new Wp.TableCellBorders();
            // 只添加需要的边框，不添加 Nil 边框（避免 Word 渲染异常）
            if (borderTop) borders.AppendChild(new Wp.TopBorder { Val = Wp.BorderValues.Single, Size = 4u, Color = "000000" });
            if (borderBottom) borders.AppendChild(new Wp.BottomBorder { Val = Wp.BorderValues.Single, Size = 4u, Color = "000000" });
            if (borderLeft) borders.AppendChild(new Wp.LeftBorder { Val = Wp.BorderValues.Single, Size = 4u, Color = "000000" });
            if (borderRight) borders.AppendChild(new Wp.RightBorder { Val = Wp.BorderValues.Single, Size = 4u, Color = "000000" });
            cellProps.AppendChild(borders);
        }
        cell.AppendChild(cellProps);
        var para = new Wp.Paragraph();
        if (centered)
        {
            para.AppendChild(new Wp.ParagraphProperties(new Wp.Justification { Val = Wp.JustificationValues.Center }));
        }
        para.AppendChild(MakeRun(text, sizeHalfPt, bold));
        cell.AppendChild(para);
        return cell;
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
