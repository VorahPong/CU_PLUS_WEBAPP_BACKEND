const crypto = require("crypto");
const prisma = require("../prisma");

function hashToken(token) {
	return crypto.createHash("sha256").update(token).digest("hex");
}

async function requireAuth(req, res, next) {
	try {
		const rawToken = req.cookies?.session_id;

		if (!rawToken) {
			return res.status(401).json({ message: "Unauthorized" });
		}

		const tokenHash = hashToken(rawToken);

		const session = await prisma.session.findUnique({
			where: { tokenHash },
			include: { user: true },
		});

		if (!session) {
			return res.status(401).json({ message: "Invalid session" });
		}

		if (session.revokedAt) {
			return res.status(401).json({ message: "Session revoked" });
		}

		if (new Date(session.expiresAt) < new Date()) {
			return res.status(401).json({ message: "Session expired" });
		}

		req.user = {
			id: session.user.id,
			email: session.user.email,
			role: session.user.role,
			year: session.user.year || null,
		};

		req.session = session;
		next();
	} catch (e) {
		return res.status(500).json({ message: "Server error", error: String(e) });
	}
}

function requireAdmin(req, res, next) {
	if (!req.user || req.user.role !== "admin") {
		return res.status(403).json({ message: "Admin access required" });
	}
	next();
}

module.exports = {
	requireAuth,
	requireAdmin,
};
