

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
	return new Map(
		answers.map((answer) => [String(answer.formFieldId), answer]),
	);
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
		margin: 50,
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

function drawHeader(doc, form, options = {}) {
	const title = normalizeText(form?.title, "Form Export");
	const subtitle = normalizeText(options.subtitle);
	const instructions = normalizeText(form?.instructions || form?.description);

	doc.font("Helvetica-Bold").fontSize(18).text(title, { align: "left" });

	if (subtitle) {
		doc.moveDown(0.3);
		doc.font("Helvetica").fontSize(11).fillColor("#555555").text(subtitle);
		doc.fillColor("black");
	}

	if (instructions) {
		doc.moveDown(0.8);
		doc.font("Helvetica").fontSize(11).text(instructions, {
			align: "left",
			lineGap: 2,
		});
	}

	doc.moveDown(1);
	const y = doc.y;
	doc
		.moveTo(doc.page.margins.left, y)
		.lineTo(doc.page.width - doc.page.margins.right, y)
		.strokeColor("#BDBDBD")
		.stroke();
	doc.strokeColor("black");
	doc.moveDown(1);
}

function drawMetaLine(doc, label, value) {
	const safeValue = normalizeText(value, "—");
	doc
		.font("Helvetica-Bold")
		.fontSize(11)
		.text(`${label}: `, { continued: true })
		.font("Helvetica")
		.text(safeValue);
}

function drawFieldLabel(doc, field, suffix = "") {
	const label = extractFieldLabel(field);
	doc.font("Helvetica-Bold").fontSize(11).text(`${label}${suffix}`);
}

function drawBlankLine(doc, width = 260) {
	const startX = doc.x;
	const y = doc.y + 12;
	doc.moveTo(startX, y).lineTo(startX + width, y).stroke();
	doc.moveDown(1.2);
}

function drawParagraphBox(doc, minHeight = 90) {
	const x = doc.page.margins.left;
	const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
	const y = doc.y + 6;
	doc.rect(x, y, width, minHeight).stroke();
	doc.y = y + minHeight + 12;
}

function drawCheckboxOption(doc, label, checked = false) {
	const boxSize = 10;
	const x = doc.x;
	const y = doc.y + 2;
	doc.rect(x, y, boxSize, boxSize).stroke();
	if (checked) {
		doc
			.moveTo(x + 2, y + 5)
			.lineTo(x + 4.5, y + 8)
			.lineTo(x + 8, y + 2)
			.stroke();
	}
	doc.text(`  ${label}`, x + boxSize + 4, doc.y);
	doc.moveDown(0.3);
}

async function drawSignatureBlock(doc, field, answer) {
	drawFieldLabel(doc, field);
	doc.moveDown(0.4);

	const signatureUrl = normalizeText(answer?.valueSignatureUrl);
	const x = doc.page.margins.left;
	const width = 250;
	const height = 80;
	const y = doc.y;

	doc.rect(x, y, width, height).stroke();

	if (signatureUrl) {
		try {
			const buffer = await fetchBuffer(signatureUrl);
			if (buffer) {
				doc.image(buffer, x + 8, y + 8, {
					fit: [width - 16, height - 16],
					align: "center",
					valign: "center",
				});
			}
		} catch (error) {
			doc
				.font("Helvetica-Oblique")
				.fontSize(10)
				.text("Signature image unavailable", x + 8, y + 32, {
					width: width - 16,
				});
		}
	} else {
		doc
			.font("Helvetica-Oblique")
			.fontSize(10)
			.text("No signature provided", x + 8, y + 32, {
				width: width - 16,
			});
	}

	doc.y = y + height + 8;
	doc.font("Helvetica").fontSize(10).text("Signature");
	doc.moveDown(0.8);
}

function drawAnswerText(doc, text) {
	const safeText = normalizeText(text, "—");
	doc.font("Helvetica").fontSize(11).text(safeText, {
		align: "left",
		lineGap: 2,
	});
	doc.moveDown(0.8);
}

function drawBlankField(doc, field) {
	const type = String(field?.type || "").toLowerCase();
	const requiredSuffix = field?.required ? " *" : "";
	ensureSpace(doc, 80);
	drawFieldLabel(doc, field, requiredSuffix);
	doc.moveDown(0.3);

	switch (type) {
		case "textarea":
			drawParagraphBox(doc, 100);
			break;
		case "checkbox": {
			const options = getCheckboxOptions(field);
			if (options.length === 0) {
				drawBlankLine(doc, 300);
				break;
			}
			options.forEach((option) => drawCheckboxOption(doc, option, false));
			doc.moveDown(0.4);
			break;
		}
		case "signature": {
			const x = doc.page.margins.left;
			const y = doc.y + 6;
			const width = 250;
			const height = 80;
			doc.rect(x, y, width, height).stroke();
			doc.y = y + height + 8;
			doc.font("Helvetica").fontSize(10).text("Signature");
			doc.moveDown(0.8);
			break;
		}
		default:
			drawBlankLine(doc, 320);
	}
}

async function drawFilledField(doc, field, answer) {
	const type = String(field?.type || "").toLowerCase();
	const requiredSuffix = field?.required ? " *" : "";
	ensureSpace(doc, 90);
	drawFieldLabel(doc, field, requiredSuffix);
	doc.moveDown(0.3);

	switch (type) {
		case "checkbox": {
			const selected = new Set(
				answerValueForField(field, answer)
					.split(",")
					.map((value) => normalizeText(value))
					.filter(Boolean),
			);
			const options = getCheckboxOptions(field);
			if (options.length === 0) {
				drawAnswerText(doc, answerValueForField(field, answer));
				break;
			}
			options.forEach((option) => drawCheckboxOption(doc, option, selected.has(option)));
			doc.moveDown(0.4);
			break;
		}
		case "textarea":
			drawAnswerText(doc, answerValueForField(field, answer));
			break;
		case "signature":
			await drawSignatureBlock(doc, field, answer);
			break;
		default:
			drawAnswerText(doc, answerValueForField(field, answer));
	}
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

	drawMetaLine(doc, "Year", normalizeText(form?.year, "All Years"));
	drawMetaLine(doc, "Due Date", formatDate(form?.dueDate) || "—");
	doc.moveDown(1);

	const fields = Array.isArray(form?.fields) ? form.fields : [];
	for (const rawField of fields) {
		const field = rawField || {};
		drawBlankField(doc, field);
	}

	doc.moveDown(0.5);
	const lineY = doc.y + 20;
	const leftX = doc.page.margins.left;
	const dateX = doc.page.width - doc.page.margins.right - 160;
	doc.moveTo(leftX, lineY).lineTo(leftX + 260, lineY).stroke();
	doc.moveTo(dateX, lineY).lineTo(dateX + 120, lineY).stroke();
	doc.font("Helvetica").fontSize(10).text("Signature", leftX, lineY + 4);
	doc.font("Helvetica").fontSize(10).text("Date", dateX, lineY + 4);

	return pdfToBuffer(doc);
}

async function generateSubmissionPdfBuffer(form, submission) {
	const doc = createPdfDocument();
	const meta = getSubmissionMeta(submission);
	const subtitle = meta.studentName
		? `Submission Export for ${meta.studentName}`
		: "Submission Export";

	drawHeader(doc, form, { subtitle });

	drawMetaLine(doc, "Student", meta.studentName || "—");
	if (meta.studentEmail) {
		drawMetaLine(doc, "Email", meta.studentEmail);
	}
	drawMetaLine(doc, "Status", meta.status || "—");
	drawMetaLine(doc, "Submitted", meta.submittedAt || "—");
	if (meta.grade) drawMetaLine(doc, "Grade", meta.grade);
	if (meta.score) drawMetaLine(doc, "Score", meta.score);
	if (meta.reviewedAt) drawMetaLine(doc, "Reviewed", meta.reviewedAt);
	if (meta.reviewerName) drawMetaLine(doc, "Reviewed By", meta.reviewerName);
	if (meta.feedback) {
		doc.moveDown(0.5);
		drawFieldLabel(doc, { label: "Feedback" });
		doc.moveDown(0.2);
		drawAnswerText(doc, meta.feedback);
	}
		doc.moveDown(0.5);

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