const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const prisma = require("../../prisma");
const { requireAuth } = require("../../middleware/auth");

const router = express.Router();

function hashToken(token) {
	return crypto.createHash("sha256").update(token).digest("hex");
}

function createSessionCookie(res, token) {
	res.cookie("session_id", token, {
		httpOnly: true,
		secure: false, // true in production with HTTPS
		sameSite: "lax",
		maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
	});
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

		await prisma.session.deleteMany({
			where: {
				userId: user.id,
			},
		});

		if (!user.isActive) {
			return res.status(403).json({
				message: "This account has been deactivated",
			});
		}

		const rawToken = crypto.randomBytes(32).toString("hex");
		const tokenHash = hashToken(rawToken);

		const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

		await prisma.session.create({
			data: {
				userId: user.id,
				tokenHash,
				expiresAt,
			},
		});

		createSessionCookie(res, rawToken);

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
