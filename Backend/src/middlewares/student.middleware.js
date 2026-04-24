const jwt = require("jsonwebtoken");

const authStudent = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Token yok",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Token formatı hatalı",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "dev_secret"
    );

    if (decoded.role !== "student") {
      return res.status(403).json({
        success: false,
        message: "Sadece öğrenciler erişebilir",
      });
    }

    // req içine user bilgilerini koyuyoruz
    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Geçersiz token",
    });
  }
};

module.exports = {
  authStudent,
};