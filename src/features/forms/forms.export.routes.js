const express = require("express");
const prisma = require("../../prisma");
const { requireAuth } = require("../../middleware/auth");
const {
  sendBlankFormPdf,
  sendSubmissionPdf,
} = require("./formPdf.services");

const router = express.Router();

function normalizeFilename(value, fallback = "export") {
  const text = String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9-_ ]+/g, "")
    .replace(/\s+/g, "-");

  return text || fallback;
}

function studentYearFilter(user) {
  const year = String(user?.year || "").trim();

  switch (year) {
    case "1":
      return { firstYear: true };
    case "2":
      return { secondYear: true };
    case "3":
      return { thirdYear: true };
    case "4":
      return { fourthYear: true };
    default:
      return null;
  }
}

async function canStudentAccessForm(reqUser, form) {
  if (!form) return false;
  if (reqUser?.role === "admin") return true;

  const year = String(reqUser?.year || "").trim();
  if (!year) return form.everyone === true;

  if (form.everyone) return true;
  if (year === "1" && form.firstYear) return true;
  if (year === "2" && form.secondYear) return true;
  if (year === "3" && form.thirdYear) return true;
  if (year === "4" && form.fourthYear) return true;

  return false;
}

/**
 * @swagger
 * /forms/{id}/export-pdf:
 *   get:
 *     summary: Export a blank form as PDF
 *     tags: [Forms Export]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Form ID
 *     responses:
 *       200:
 *         description: PDF exported successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Form not found
 *       500:
 *         description: Server error
 */
router.get("/:id/export-pdf", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const form = await prisma.formTemplate.findUnique({
      where: { id },
      include: {
        fields: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!form) {
      return res.status(404).json({
        message: "Form not found",
      });
    }

    const allowed = await canStudentAccessForm(req.user, form);
    if (!allowed) {
      return res.status(403).json({
        message: "You do not have access to export this form",
      });
    }

    const filename = `${normalizeFilename(form.title, "form")}-blank.pdf`;
    await sendBlankFormPdf(res, form, filename);
  } catch (e) {
    return res.status(500).json({
      message: "Server error",
      error: String(e),
    });
  }
});

/**
 * @swagger
 * /forms/submissions/{submissionId}/export-pdf:
 *   get:
 *     summary: Export a filled submission as PDF
 *     tags: [Forms Export]
 *     parameters:
 *       - in: path
 *         name: submissionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Submission ID
 *     responses:
 *       200:
 *         description: PDF exported successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Submission not found
 *       500:
 *         description: Server error
 */
router.get("/submissions/:submissionId/export-pdf", requireAuth, async (req, res) => {
  try {
    const { submissionId } = req.params;

    const submission = await prisma.formSubmission.findUnique({
      where: { id: submissionId },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        answers: true,
        formTemplate: {
          include: {
            fields: {
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
    });

    if (!submission) {
      return res.status(404).json({
        message: "Submission not found",
      });
    }

    const form = submission.formTemplate;
    if (!form) {
      return res.status(404).json({
        message: "Form not found for this submission",
      });
    }

    if (req.user.role !== "admin" && submission.studentId !== req.user.id) {
      return res.status(403).json({
        message: "You do not have access to export this submission",
      });
    }

    if (req.user.role !== "admin") {
      const allowed = await canStudentAccessForm(req.user, form);
      if (!allowed) {
        return res.status(403).json({
          message: "You do not have access to export this submission",
        });
      }
    }

    const studentName = [submission.student?.firstName, submission.student?.lastName]
      .filter(Boolean)
      .join(" ");
    const filename = `${normalizeFilename(form.title, "submission")}-${normalizeFilename(
      studentName || submission.student?.email || "student",
      "student",
    )}.pdf`;

    await sendSubmissionPdf(res, form, submission, `${filename}.pdf`);
  } catch (e) {
    return res.status(500).json({
      message: "Server error",
      error: String(e),
    });
  }
});

module.exports = router;