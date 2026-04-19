const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const prisma = require("../../prisma");
const { requireAuth } = require("../../middleware/auth");

const router = express.Router();

const nodemailer = require("nodemailer");

function hashCode(code) {
	return crypto.createHash("sha256").update(code).digest("hex");
}

function generateSixDigitCode() {
	return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendTwoFactorEmail(toEmail, code) {
	const transporter = nodemailer.createTransport({
		host: process.env.SMTP_HOST,
		port: Number(process.env.SMTP_PORT || 587),
		secure: false,
		auth: {
			user: process.env.SMTP_USER,
			pass: process.env.SMTP_PASS,
		},
	});

	await transporter.sendMail({
		from: process.env.MAIL_FROM,
		to: toEmail,
		subject: "Your CU Plus verification code",
		text: `Your verification code is ${code}. It expires in 10 minutes.`,
	});
}

async function createLoginSession(res, userId) {
	const rawToken = crypto.randomBytes(32).toString("hex");
	const tokenHash = hashToken(rawToken);
	const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

	await prisma.session.create({
		data: {
			userId,
			tokenHash,
			expiresAt,
		},
	});

	createSessionCookie(res, rawToken);
}

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Log in a user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@cameron.edu
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: 6251c3de-56cc-43b3-bbac-1a9611157051
 *                     email:
 *                       type: string
 *                       example: test@admin.edu
 *                     role:
 *                       type: string
 *                       example: admin
 *                     firstName:
 *                       type: string
 *                       example: admin
 *                     lastName:
 *                       type: string
 *                       example: admin
 *                     name:
 *                       type: string
 *                       nullable: true
 *                       example: null
 *                     schoolId:
 *                       type: string
 *                       example: 1
 *                     year:
 *                       type: string
 *                       example: 1000
 *       400:
 *         description: Email and password are required
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Account has been deactivated
 *       500:
 *         description: Server error
 */
router.post("/login", async (req, res) => {
	try {
		const { email, password } = req.body;

		if (!email || !password) {
			return res
				.status(400)
				.json({ message: "Email and password are required" });
		}

		const user = await prisma.user.findUnique({
			where: { email },
		});

		if (!user) {
			return res.status(401).json({ message: "Invalid credentials" });
		}

		const ok = await bcrypt.compare(password, user.password);
		if (!ok) {
			return res.status(401).json({ message: "Invalid credentials" });
		}

		if (!user.isActive) {
			return res.status(403).json({
				message: "This account has been deactivated",
			});
		}

		// remove any old unused codes for this user
		await prisma.emailTwoFactorCode.deleteMany({
			where: {
				userId: user.id,
				usedAt: null,
			},
		});

		const rawCode = generateSixDigitCode();
		const codeHash = hashCode(rawCode);
		const expiresAt = new Date(Date.now() + 1000 * 60 * 10); // 10 min

		await prisma.emailTwoFactorCode.create({
			data: {
				userId: user.id,
				codeHash,
				expiresAt,
			},
		});

		await sendTwoFactorEmail(user.email, rawCode);

		return res.json({
			requiresTwoFactor: true,
			email: user.email,
			message: "Verification code sent",
		});
	} catch (e) {
		return res.status(500).json({ message: "Server error", error: String(e) });
	}
});

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get the currently authenticated user
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Current user returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: 6251c3de-56cc-43b3-bbac-1a9611157051
 *                     email:
 *                       type: string
 *                       example: test@admin.edu
 *                     role:
 *                       type: string
 *                       example: admin
 *                     firstName:
 *                       type: string
 *                       example: admin
 *                     lastName:
 *                       type: string
 *                       example: admin
 *                     name:
 *                       type: string
 *                       nullable: true
 *                       example: null
 *                     schoolId:
 *                       type: string
 *                       example: 1
 *                     year:
 *                       type: string
 *                       example: 1000
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get("/me", requireAuth, async (req, res) => {
	try {
		const user = await prisma.user.findUnique({
			where: { id: req.user.id },
			select: {
				id: true,
				email: true,
				role: true,
				firstName: true,
				lastName: true,
				name: true,
				schoolId: true,
				year: true,
			},
		});

		return res.json({ user });
	} catch (e) {
		return res.status(500).json({ message: "Server error", error: String(e) });
	}
});

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Log out the current user
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Logged out
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post("/logout", requireAuth, async (req, res) => {
	try {
		await prisma.session.update({
			where: { id: req.session.id },
			data: { revokedAt: new Date() },
		});

		res.clearCookie("session_id", {
			httpOnly: true,
			secure: false,
			sameSite: "lax",
		});

		return res.json({ message: "Logged out" });
	} catch (e) {
		return res.status(500).json({ message: "Server error", error: String(e) });
	}
});

module.exports = router;

router.post("/verify-2fa", async (req, res) => {
	try {
		const { email, code } = req.body;

		if (!email || !code) {
			return res.status(400).json({ message: "Email and code are required" });
		}

		const user = await prisma.user.findUnique({
			where: { email },
		});

		if (!user) {
			return res.status(401).json({ message: "Invalid verification request" });
		}

		const latestCode = await prisma.emailTwoFactorCode.findFirst({
			where: {
				userId: user.id,
				usedAt: null,
			},
			orderBy: {
				createdAt: "desc",
			},
		});

		if (!latestCode) {
			return res.status(401).json({ message: "No verification code found" });
		}

		if (latestCode.expiresAt < new Date()) {
			return res.status(401).json({ message: "Verification code expired" });
		}

		if (latestCode.attempts >= 5) {
			return res.status(429).json({ message: "Too many attempts" });
		}

		const incomingHash = hashCode(code);

		if (incomingHash !== latestCode.codeHash) {
			await prisma.emailTwoFactorCode.update({
				where: { id: latestCode.id },
				data: {
					attempts: { increment: 1 },
				},
			});

			return res.status(401).json({ message: "Invalid verification code" });
		}

		await prisma.emailTwoFactorCode.update({
			where: { id: latestCode.id },
			data: {
				usedAt: new Date(),
			},
		});

		await prisma.session.deleteMany({
			where: {
				userId: user.id,
			},
		});

		await createLoginSession(res, user.id);

		return res.json({
			user: {
				id: user.id,
				email: user.email,
				role: user.role,
				firstName: user.firstName,
				lastName: user.lastName,
				name: user.name,
				schoolId: user.schoolId,
				year: user.year,
			},
		});
	} catch (e) {
		return res.status(500).json({ message: "Server error", error: String(e) });
	}
});


router.post("/resend-2fa", async (req, res) => {
	try {
		const { email } = req.body;

		if (!email) {
			return res.status(400).json({ message: "Email is required" });
		}

		const user = await prisma.user.findUnique({
			where: { email },
		});

		if (!user) {
			return res.status(401).json({ message: "Invalid request" });
		}

		const latestCode = await prisma.emailTwoFactorCode.findFirst({
			where: {
				userId: user.id,
				usedAt: null,
			},
			orderBy: {
				createdAt: "desc",
			},
		});

		if (latestCode) {
			const secondsSinceLastSend =
				(Date.now() - new Date(latestCode.sentAt).getTime()) / 1000;

			if (secondsSinceLastSend < 30) {
				return res.status(429).json({
					message: "Please wait before requesting another code",
				});
			}
		}

		await prisma.emailTwoFactorCode.deleteMany({
			where: {
				userId: user.id,
				usedAt: null,
			},
		});

		const rawCode = generateSixDigitCode();
		const codeHash = hashCode(rawCode);
		const expiresAt = new Date(Date.now() + 1000 * 60 * 10);

		await prisma.emailTwoFactorCode.create({
			data: {
				userId: user.id,
				codeHash,
				expiresAt,
			},
		});

		await sendTwoFactorEmail(user.email, rawCode);

		return res.json({ message: "Verification code resent" });
	} catch (e) {
		return res.status(500).json({ message: "Server error", error: String(e) });
	}
});
