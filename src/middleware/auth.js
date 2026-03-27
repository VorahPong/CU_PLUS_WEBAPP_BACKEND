const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
	const authHeader = req.headers.authorization || "";
	const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

	if (!token) {
		return res.status(401).json({ message: "Unauthorized" });
	}

	try {
		const payload = jwt.verify(
			token,
			process.env.JWT_SECRET || "dev_secret_change_me",
		);

		req.user = {
			id: payload.sub,
			email: payload.email,
			role: payload.role,
		};

		next();
	} catch (err) {
		return res.status(401).json({ message: "Invalid or expired token" });
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
