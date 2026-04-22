const pool = require("../config/db");

const getAllUsers = async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT * FROM users ORDER BY user_id ASC"
    );

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "SELECT * FROM users WHERE user_id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

const createUser = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const {
      user_name,
      user_surname,
      user_role,
      student_id,
      user_class,
      user_class_code,
      school_id,
      email,
      password,
    } = req.body;

    if (!user_name || !user_surname || !user_role) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    if ((user_role === "teacher" || user_role === "student") && !school_id) {
      return res.status(400).json({
        success: false,
        message: "teacher ve student için school_id zorunlu",
      });
    }

    await client.query("BEGIN");

    let school = null;
    let schemaName = null;

    if (school_id) {
      const schoolResult = await client.query(
        "SELECT * FROM schools WHERE school_id = $1 LIMIT 1",
        [school_id]
      );

      if (schoolResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "School not found",
        });
      }

      school = schoolResult.rows[0];
      schemaName = `school_${school.school_code}`;
    }

    const result = await client.query(
      `INSERT INTO users
      (user_name, user_surname, user_role, student_id, user_class, user_class_code, school_id, email, password)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        user_name,
        user_surname,
        user_role,
        student_id || null,
        user_class || null,
        user_class_code || null,
        school_id || null,
        email || null,
        password || null,
      ]
    );

    const createdUser = result.rows[0];

    if (schemaName) {
      await client.query(
        `
        INSERT INTO ${schemaName}.users
        (user_id, user_name, user_surname, email, password, user_role, student_id, user_class, user_class_code, school_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (user_id) DO NOTHING
        `,
        [
          createdUser.user_id,
          createdUser.user_name,
          createdUser.user_surname,
          createdUser.email,
          createdUser.password,
          createdUser.user_role,
          createdUser.student_id,
          createdUser.user_class,
          createdUser.user_class_code,
          createdUser.school_id,
        ]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "User created",
      data: createdUser,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      user_name,
      user_surname,
      user_role,
      student_id,
      user_class,
      user_class_code,
      school_id,
      email,
      password,
    } = req.body;

    const existing = await pool.query(
      "SELECT * FROM users WHERE user_id = $1",
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const current = existing.rows[0];

    const result = await pool.query(
      `UPDATE users
       SET user_name = $1,
           user_surname = $2,
           user_role = $3,
           student_id = $4,
           user_class = $5,
           user_class_code = $6,
           school_id = $7,
           email = $8,
           password = $9
       WHERE user_id = $10
       RETURNING *`,
      [
        user_name ?? current.user_name,
        user_surname ?? current.user_surname,
        user_role ?? current.user_role,
        student_id ?? current.student_id,
        user_class ?? current.user_class,
        user_class_code ?? current.user_class_code,
        school_id ?? current.school_id,
        email ?? current.email,
        password ?? current.password,
        id,
      ]
    );

    res.status(200).json({
      success: true,
      message: "User updated",
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM users WHERE user_id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "User deleted",
    });
  } catch (error) {
    next(error);
  }
};

const loginUser = async (req, res, next) => {
  try {
    const { schoolCode, email, password } = req.body;

    if (!schoolCode || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "schoolCode, email ve password zorunlu",
      });
    }

    const schoolResult = await pool.query(
      "SELECT * FROM schools WHERE school_code = $1 LIMIT 1",
      [schoolCode]
    );

    if (schoolResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Okul bulunamadı",
      });
    }

    const school = schoolResult.rows[0];

    const userResult = await pool.query(
      `
      SELECT *
      FROM users
      WHERE email = $1
        AND password = $2
        AND school_id = $3
      LIMIT 1
      `,
      [email, password, school.school_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Mail, şifre veya okul kodu hatalı",
      });
    }

    const user = userResult.rows[0];

    return res.status(200).json({
      success: true,
      message: "Giriş başarılı",
      data: {
        user: {
          user_id: user.user_id,
          user_name: user.user_name,
          user_surname: user.user_surname,
          email: user.email,
          user_role: user.user_role,
          school_id: user.school_id,
        },
        school: {
          school_id: school.school_id,
          school_code: school.school_code,
          school_name: school.school_name,
          schema_name: `school_${school.school_code}`,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  loginUser,
};