const PDFDocument = require("pdfkit");
const http = require("http");
const https = require("https");

function formatDate(value) {
	if (!value) return "";

	const parsed = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(parsed.getTime())) return "";

	return `${parsed.getMonth() + 1}/${parsed.getDate()}/${parsed.getFullYear()}`;
}

function normalizeText(value, fallback = "") {
	if (value == null) return fallback;
	const text = String(value).trim();
	return text || fallback;
}

function extractFieldLabel(field) {
	return normalizeText(field?.label, "Untitled Field");
}

function getCheckboxOptions(field) {
	const config = field?.configJson || {};

	if (Array.isArray(config.options)) {
		return config.options
			.map((option) => normalizeText(option))
			.filter(Boolean);
	}

	if (typeof config.options === "string") {
		return config.options
			.split(",")
			.map((option) => normalizeText(option))
			.filter(Boolean);
	}

	return [];
}

function getAnswerMap(submission) {
	const answers = Array.isArray(submission?.answers) ? submission.answers : [];
	return new Map(answers.map((answer) => [String(answer.formFieldId), answer]));
}

function answerValueForField(field, answer) {
	if (!answer) return "";

	const type = String(field?.type || "").toLowerCase();

	switch (type) {
		case "text":
		case "textarea":
		case "year":
		case "checkbox":
			return normalizeText(answer.valueText);
		case "date":
			return formatDate(answer.valueDate);
		case "signature":
			return normalizeText(answer.valueSignatureUrl);
		default:
			return normalizeText(
				answer.valueText || answer.valueDate || answer.valueSignatureUrl,
			);
	}
}

function getSubmissionMeta(submission) {
	const student = submission?.student || {};
	const reviewedBy = submission?.reviewedBy || {};

	const studentName = [student.firstName, student.lastName]
		.map((part) => normalizeText(part))
		.filter(Boolean)
		.join(" ");

	const reviewerName = [reviewedBy.firstName, reviewedBy.lastName]
		.map((part) => normalizeText(part))
		.filter(Boolean)
		.join(" ");

	return {
		studentName,
		studentEmail: normalizeText(student.email),
		status: normalizeText(submission?.status),
		grade: normalizeText(submission?.grade),
		score:
			submission?.score == null || submission.score === ""
				? ""
				: String(submission.score),
		feedback: normalizeText(submission?.feedback),
		submittedAt: formatDate(submission?.submittedAt || submission?.updatedAt),
		reviewedAt: formatDate(submission?.reviewedAt),
		reviewerName,
	};
}

function fetchBuffer(url) {
	return new Promise((resolve, reject) => {
		if (!url) {
			resolve(null);
			return;
		}

		let parsed;
		try {
			parsed = new URL(url);
		} catch (error) {
			reject(error);
			return;
		}

		const client = parsed.protocol === "https:" ? https : http;

		client
			.get(parsed, (response) => {
				if (
					response.statusCode &&
					response.statusCode >= 300 &&
					response.statusCode < 400 &&
					response.headers.location
				) {
					response.resume();
					fetchBuffer(response.headers.location).then(resolve).catch(reject);
					return;
				}

				if (response.statusCode !== 200) {
					response.resume();
					reject(
						new Error(`Failed to fetch asset. Status: ${response.statusCode}`),
					);
					return;
				}

				const chunks = [];
				response.on("data", (chunk) => chunks.push(chunk));
				response.on("end", () => resolve(Buffer.concat(chunks)));
				response.on("error", reject);
			})
			.on("error", reject);
	});
}

function createPdfDocument() {
	return new PDFDocument({
		size: "LETTER",
		margin: 42,
		info: {
			Title: "CU PLUS Form Export",
			Author: "CU PLUS",
		},
	});
}

function pdfToBuffer(doc) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		doc.on("data", (chunk) => chunks.push(chunk));
		doc.on("end", () => resolve(Buffer.concat(chunks)));
		doc.on("error", reject);
		doc.end();
	});
}

function ensureSpace(doc, neededHeight = 80) {
	const bottomLimit = doc.page.height - doc.page.margins.bottom;
	if (doc.y + neededHeight > bottomLimit) {
		doc.addPage();
	}
}

const PDF_COLORS = {
	black: "#111111",
	white: "#FFFFFF",
	muted: "#666666",
	lightText: "#8A8A8A",
	border: "#D9D9D9",
	softBorder: "#E8E8E8",
	background: "#F7F7F7",
	surface: "#FBFBFB",
	yellowSoft: "#FFF4CC",
	yellowBorder: "#FFD971",
	yellowText: "#8A5A00",
};

function contentWidth(doc) {
	return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function resetFillAndStroke(doc) {
	doc.fillColor(PDF_COLORS.black).strokeColor(PDF_COLORS.black);
}

function drawRoundedBox(doc, x, y, width, height, options = {}) {
	doc.save();
	doc
		.roundedRect(x, y, width, height, options.radius ?? 8)
		.fillAndStroke(
			options.fill || PDF_COLORS.white,
			options.stroke || PDF_COLORS.border,
		);
	doc.restore();
	resetFillAndStroke(doc);
}

function estimateTextHeight(doc, text, width, fontSize = 9.5) {
	doc.font("Helvetica").fontSize(fontSize);
	return doc.heightOfString(normalizeText(text, "—"), {
		width,
		lineGap: 2,
	});
}

function drawHeader(doc, form, options = {}) {
	const title = normalizeText(form?.title, "Form Export");
	const subtitle = normalizeText(options.subtitle);
	const instructions = normalizeText(form?.instructions || form?.description);
	const x = doc.page.margins.left;
	const width = contentWidth(doc);
	const startY = doc.y;

	doc.save();
	doc.roundedRect(x, startY, width, 84, 12).fill(PDF_COLORS.black);
	doc.restore();

	doc
		.font("Helvetica-Bold")
		.fontSize(9)
		.fillColor(PDF_COLORS.yellowBorder)
		.text("CU PLUS", x + 16, startY + 14);

	doc
		.font("Helvetica-Bold")
		.fontSize(18)
		.fillColor(PDF_COLORS.white)
		.text(title, x + 16, startY + 32, {
			width: width - 32,
			height: 24,
			ellipsis: true,
		});

	if (subtitle) {
		doc
			.font("Helvetica")
			.fontSize(9.5)
			.fillColor("#D6D6D6")
			.text(subtitle, x + 16, startY + 60, {
				width: width - 32,
				height: 14,
				ellipsis: true,
			});
	}

	doc.y = startY + 100;
	resetFillAndStroke(doc);

	if (instructions) {
		const instructionHeight = Math.min(
			estimateTextHeight(doc, instructions, width - 28, 9.5) + 26,
			72,
		);

		ensureSpace(doc, instructionHeight + 10);
		const y = doc.y;

		drawRoundedBox(doc, x, y, width, instructionHeight, {
			fill: PDF_COLORS.yellowSoft,
			stroke: PDF_COLORS.yellowBorder,
			radius: 10,
		});

		doc
			.font("Helvetica-Bold")
			.fontSize(9.5)
			.fillColor(PDF_COLORS.yellowText)
			.text("Instructions", x + 14, y + 8);

		doc
			.font("Helvetica")
			.fontSize(9.5)
			.fillColor(PDF_COLORS.black)
			.text(instructions, x + 14, y + 23, {
				width: width - 28,
				height: instructionHeight - 30,
				lineGap: 2,
				ellipsis: true,
			});

		doc.y = y + instructionHeight + 12;
	}

	resetFillAndStroke(doc);
}

function drawSectionTitle(doc, title) {
	ensureSpace(doc, 32);

	const x = doc.page.margins.left;
	const width = contentWidth(doc);

	doc
		.font("Helvetica-Bold")
		.fontSize(12)
		.fillColor(PDF_COLORS.black)
		.text(title, x, doc.y);

	doc
		.moveTo(x, doc.y + 6)
		.lineTo(x + width, doc.y + 6)
		.strokeColor(PDF_COLORS.softBorder)
		.stroke();

	resetFillAndStroke(doc);
	doc.moveDown(0.75);
}

function formatStatus(value) {
	return normalizeText(value, "—").replace(/_/g, " ");
}

function drawMetaGrid(doc, items) {
	const visibleItems = items.filter(
		(item) => item && normalizeText(item.value),
	);
	if (visibleItems.length === 0) return;

	const x = doc.page.margins.left;
	const width = contentWidth(doc);
	const labelWidth = 86;
	const rowHeight = 22;
	const totalHeight = visibleItems.length * rowHeight + 12;
	const startY = doc.y;

	ensureSpace(doc, totalHeight + 8);

	drawRoundedBox(doc, x, startY, width, totalHeight, {
		fill: PDF_COLORS.surface,
		stroke: PDF_COLORS.softBorder,
		radius: 10,
	});

	visibleItems.forEach((item, index) => {
		const rowY = startY + 8 + index * rowHeight;

		doc
			.font("Helvetica-Bold")
			.fontSize(8)
			.fillColor(PDF_COLORS.lightText)
			.text(String(item.label).toUpperCase(), x + 12, rowY + 2, {
				width: labelWidth,
				height: 12,
				ellipsis: true,
			});

		doc
			.font("Helvetica-Bold")
			.fontSize(9.5)
			.fillColor(PDF_COLORS.black)
			.text(normalizeText(item.value, "—"), x + 12 + labelWidth, rowY + 1, {
				width: width - labelWidth - 24,
				height: 14,
				ellipsis: true,
			});

		if (index < visibleItems.length - 1) {
			doc
				.moveTo(x + 12, rowY + rowHeight - 3)
				.lineTo(x + width - 12, rowY + rowHeight - 3)
				.strokeColor(PDF_COLORS.softBorder)
				.stroke();
		}
	});

	resetFillAndStroke(doc);
	doc.y = startY + totalHeight + 12;
}

function drawPill(doc, x, y, text, options = {}) {
	const label = normalizeText(text, "—");
	const fontSize = options.fontSize ?? 7;
	const paddingX = options.paddingX ?? 6;
	const paddingY = options.paddingY ?? 2;

	doc.font("Helvetica-Bold").fontSize(fontSize);
	const width = Math.min(
		doc.widthOfString(label) + paddingX * 2,
		options.maxWidth ?? 72,
	);
	const height = fontSize + paddingY * 2;

	doc.save();
	doc
		.roundedRect(x, y, width, height, height / 2)
		.fillAndStroke(
			options.fill || PDF_COLORS.background,
			options.stroke || PDF_COLORS.softBorder,
		);

	doc
		.fillColor(options.color || PDF_COLORS.muted)
		.text(label, x + paddingX, y + paddingY - 1, {
			width: width - paddingX * 2,
			ellipsis: true,
		});

	doc.restore();
	resetFillAndStroke(doc);

	return { width, height };
}

function drawFieldCardShell(doc, field, answerHeight = 28) {
	const x = doc.page.margins.left;
	const width = contentWidth(doc);
	const label = extractFieldLabel(field);
	const cardHeight = Math.max(58, answerHeight + 34);

	ensureSpace(doc, cardHeight + 8);
	const y = doc.y;

	drawRoundedBox(doc, x, y, width, cardHeight, {
		fill: PDF_COLORS.white,
		stroke: PDF_COLORS.softBorder,
		radius: 10,
	});

	doc
		.font("Helvetica-Bold")
		.fontSize(10)
		.fillColor(PDF_COLORS.black)
		.text(label, x + 10, y + 9, {
			width: width - 20,
			height: 14,
			ellipsis: true,
		});

	resetFillAndStroke(doc);

	return {
		x,
		y,
		width,
		cardHeight,
		contentX: x + 10,
		contentY: y + 28,
		contentWidth: width - 20,
		bottomY: y + cardHeight,
	};
}

function drawAnswerBox(doc, x, y, width, height, text) {
	drawRoundedBox(doc, x, y, width, height, {
		fill: PDF_COLORS.background,
		stroke: PDF_COLORS.softBorder,
		radius: 7,
	});

	doc
		.font("Helvetica")
		.fontSize(9.5)
		.fillColor(PDF_COLORS.black)
		.text(normalizeText(text, "—"), x + 8, y + 7, {
			width: width - 16,
			height: height - 12,
			lineGap: 2,
			ellipsis: true,
		});

	resetFillAndStroke(doc);
}

function drawCheckboxOption(doc, label, checked = false, options = {}) {
	const boxSize = 10;
	const x = options.x ?? doc.x;
	const y = options.y ?? doc.y;
	const width = options.width ?? contentWidth(doc);

	doc.save();
	doc
		.roundedRect(x, y + 1, boxSize, boxSize, 2)
		.strokeColor(PDF_COLORS.border)
		.stroke();

	if (checked) {
		doc
			.roundedRect(x, y + 1, boxSize, boxSize, 2)
			.fillAndStroke(PDF_COLORS.black, PDF_COLORS.black);
		doc
			.strokeColor(PDF_COLORS.white)
			.lineWidth(1.2)
			.moveTo(x + 2.4, y + 6)
			.lineTo(x + 4.6, y + 8.2)
			.lineTo(x + 8.2, y + 3)
			.stroke();
	}

	doc.restore();
	resetFillAndStroke(doc);

	doc
		.font("Helvetica")
		.fontSize(9.5)
		.fillColor(PDF_COLORS.black)
		.text(normalizeText(label, "—"), x + boxSize + 7, y - 1, {
			width: width - boxSize - 7,
			height: 14,
			ellipsis: true,
		});

	resetFillAndStroke(doc);

	if (!options.manualY) {
		doc.y = y + 16;
	}
}

async function drawSignatureBlock(doc, field, answer) {
	const signatureUrl = normalizeText(answer?.valueSignatureUrl);
	const shell = drawFieldCardShell(doc, field, 68);
	const width = Math.min(280, shell.contentWidth);
	const height = 56;
	const x = shell.contentX;
	const y = shell.contentY;

	drawRoundedBox(doc, x, y, width, height, {
		fill: PDF_COLORS.background,
		stroke: PDF_COLORS.softBorder,
		radius: 7,
	});

	if (signatureUrl) {
		try {
			const buffer = await fetchBuffer(signatureUrl);
			if (buffer) {
				doc.image(buffer, x + 9, y + 9, {
					fit: [width - 18, height - 18],
					align: "center",
					valign: "center",
				});
			}
		} catch {
			doc
				.font("Helvetica-Oblique")
				.fontSize(9.5)
				.fillColor(PDF_COLORS.muted)
				.text("Signature image unavailable", x + 10, y + 22, {
					width: width - 20,
				});
		}
	} else {
		doc
			.font("Helvetica-Oblique")
			.fontSize(9.5)
			.fillColor(PDF_COLORS.muted)
			.text("No signature provided", x + 10, y + 22, {
				width: width - 20,
			});
	}

	doc
		.font("Helvetica")
		.fontSize(8)
		.fillColor(PDF_COLORS.lightText)
		.text("Signature", x + 8, y + 40);

	resetFillAndStroke(doc);
	doc.y = shell.bottomY + 8;
}

function drawBlankField(doc, field) {
	const type = String(field?.type || "").toLowerCase();
	const options = getCheckboxOptions(field);

	const answerHeight =
		type === "textarea"
			? 64
			: type === "checkbox"
				? Math.max(28, options.length * 16 + 8)
				: type === "signature"
					? 64
					: 28;

	const shell = drawFieldCardShell(doc, field, answerHeight);

	switch (type) {
		case "textarea":
			drawAnswerBox(
				doc,
				shell.contentX,
				shell.contentY,
				shell.contentWidth,
				58,
				"",
			);
			break;
		case "checkbox": {
			if (options.length === 0) {
				drawAnswerBox(
					doc,
					shell.contentX,
					shell.contentY,
					shell.contentWidth,
					24,
					"",
				);
				break;
			}

			let y = shell.contentY + 2;
			options.forEach((option) => {
				drawCheckboxOption(doc, option, false, {
					x: shell.contentX,
					y,
					width: shell.contentWidth,
					manualY: true,
				});
				y += 16;
			});
			break;
		}
		case "signature":
			drawRoundedBox(
				doc,
				shell.contentX,
				shell.contentY,
				Math.min(260, shell.contentWidth),
				58,
				{
					fill: PDF_COLORS.background,
					stroke: PDF_COLORS.softBorder,
					radius: 7,
				},
			);
			doc
				.font("Helvetica")
				.fontSize(8)
				.fillColor(PDF_COLORS.lightText)
				.text("Signature", shell.contentX + 8, shell.contentY + 42);
			resetFillAndStroke(doc);
			break;
		default:
			drawAnswerBox(
				doc,
				shell.contentX,
				shell.contentY,
				shell.contentWidth,
				24,
				"",
			);
	}

	doc.y = shell.bottomY + 8;
}

async function drawFilledField(doc, field, answer) {
	const type = String(field?.type || "").toLowerCase();

	if (type === "signature") {
		await drawSignatureBlock(doc, field, answer);
		return;
	}

	const rawValue = answerValueForField(field, answer);
	const options = getCheckboxOptions(field);
	const selected = new Set(
		rawValue
			.split(",")
			.map((value) => normalizeText(value))
			.filter(Boolean),
	);

	const answerHeight =
		type === "textarea"
			? Math.max(
					38,
					Math.min(
						90,
						estimateTextHeight(
							doc,
							rawValue || "—",
							contentWidth(doc) - 44,
							9.5,
						) + 16,
					),
				)
			: type === "checkbox"
				? Math.max(28, options.length * 16 + 8)
				: 28;

	const shell = drawFieldCardShell(doc, field, answerHeight);

	if (type === "checkbox") {
		if (options.length === 0) {
			drawAnswerBox(
				doc,
				shell.contentX,
				shell.contentY,
				shell.contentWidth,
				24,
				rawValue || "—",
			);
			doc.y = shell.bottomY + 8;
			return;
		}

		let y = shell.contentY + 2;
		options.forEach((option) => {
			drawCheckboxOption(doc, option, selected.has(option), {
				x: shell.contentX,
				y,
				width: shell.contentWidth,
				manualY: true,
			});
			y += 16;
		});

		doc.y = shell.bottomY + 8;
		return;
	}

	drawAnswerBox(
		doc,
		shell.contentX,
		shell.contentY,
		shell.contentWidth,
		Math.max(24, answerHeight - 4),
		rawValue || "—",
	);
	doc.y = shell.bottomY + 8;
}

function setPdfDownloadHeaders(res, filename) {
	res.setHeader("Content-Type", "application/pdf");
	res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
}

async function generateBlankFormPdfBuffer(form) {
	const doc = createPdfDocument();

	drawHeader(doc, form, {
		subtitle: "Blank Form Export",
	});

	drawSectionTitle(doc, "Form Details");
	drawMetaGrid(doc, [
		{ label: "Year", value: normalizeText(form?.year, "All Years") },
		{ label: "Due Date", value: formatDate(form?.dueDate) || "—" },
	]);


	const fields = Array.isArray(form?.fields) ? form.fields : [];
	for (const rawField of fields) {
		drawBlankField(doc, rawField || {});
	}

	ensureSpace(doc, 55);
	doc.moveDown(0.3);

	const lineY = doc.y + 16;
	const leftX = doc.page.margins.left;
	const dateX = doc.page.width - doc.page.margins.right - 150;

	doc.strokeColor(PDF_COLORS.border);
	doc
		.moveTo(leftX, lineY)
		.lineTo(leftX + 240, lineY)
		.stroke();
	doc
		.moveTo(dateX, lineY)
		.lineTo(dateX + 110, lineY)
		.stroke();

	doc
		.fillColor(PDF_COLORS.muted)
		.font("Helvetica")
		.fontSize(8)
		.text("Signature", leftX, lineY + 5);

	doc
		.fillColor(PDF_COLORS.muted)
		.font("Helvetica")
		.fontSize(8)
		.text("Date", dateX, lineY + 5);

	resetFillAndStroke(doc);

	return pdfToBuffer(doc);
}

async function generateSubmissionPdfBuffer(form, submission) {
	const doc = createPdfDocument();
	const meta = getSubmissionMeta(submission);

	const subtitle = meta.studentName
		? `Submission Export for ${meta.studentName}`
		: "Submission Export";

	drawHeader(doc, form, { subtitle });

	drawSectionTitle(doc, "Submission Details");
	drawMetaGrid(doc, [
		{ label: "Student", value: meta.studentName || "—" },
		{ label: "Email", value: meta.studentEmail },
		{ label: "Status", value: formatStatus(meta.status) },
		{ label: "Submitted", value: meta.submittedAt || "—" },
		{ label: "Grade", value: meta.grade },
		{ label: "Score", value: meta.score },
		{ label: "Reviewed", value: meta.reviewedAt },
		{ label: "Reviewed By", value: meta.reviewerName },
	]);

	if (meta.feedback) {
		const feedbackHeight = Math.max(
			34,
			Math.min(
				78,
				estimateTextHeight(doc, meta.feedback, contentWidth(doc) - 44, 9.5) +
					18,
			),
		);

		const shell = drawFieldCardShell(
			doc,
			{ label: "Feedback", required: false },
			feedbackHeight,
		);
		drawAnswerBox(
			doc,
			shell.contentX,
			shell.contentY,
			shell.contentWidth,
			Math.max(28, feedbackHeight - 4),
			meta.feedback,
		);
		doc.y = shell.bottomY + 8;
	}


	const answerMap = getAnswerMap(submission);
	const fields = Array.isArray(form?.fields) ? form.fields : [];

	for (const rawField of fields) {
		const field = rawField || {};
		const answer = answerMap.get(String(field.id));
		await drawFilledField(doc, field, answer);
	}

	return pdfToBuffer(doc);
}

async function sendBlankFormPdf(res, form, filename = "form-export.pdf") {
	const buffer = await generateBlankFormPdfBuffer(form);
	setPdfDownloadHeaders(res, filename);
	res.send(buffer);
}

async function sendSubmissionPdf(
	res,
	form,
	submission,
	filename = "submission-export.pdf",
) {
	const buffer = await generateSubmissionPdfBuffer(form, submission);
	setPdfDownloadHeaders(res, filename);
	res.send(buffer);
}

module.exports = {
	formatDate,
	generateBlankFormPdfBuffer,
	generateSubmissionPdfBuffer,
	sendBlankFormPdf,
	sendSubmissionPdf,
};
