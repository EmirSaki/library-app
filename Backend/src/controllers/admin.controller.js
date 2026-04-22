const pool = require("../config/db");

const createSchool = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { schoolCode, schoolName } = req.body;

    if (!schoolCode || !schoolName) {
      return res.status(400).json({
        success: false,
        message: "schoolCode ve schoolName zorunlu",
      });
    }

    const schemaName = `school_${schoolCode}`;

    await client.query("BEGIN");

    const schoolInsert = await client.query(
      `
      INSERT INTO schools (school_code, school_name)
      VALUES ($1, $2)
      ON CONFLICT (school_code)
      DO UPDATE SET school_name = EXCLUDED.school_name
      RETURNING *
      `,
      [schoolCode, schoolName]
    );

    const school = schoolInsert.rows[0];

    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);

    // USERS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.users (
        local_user_id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
        user_name VARCHAR(100) NOT NULL,
        user_surname VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL,
        password VARCHAR(255),
        user_role VARCHAR(50) NOT NULL,
        student_id VARCHAR(50),
        user_class VARCHAR(50),
        user_class_code VARCHAR(50),
        school_id INTEGER NOT NULL REFERENCES public.schools(school_id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // STUDENTS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.students (
        student_id SERIAL PRIMARY KEY,
        student_number VARCHAR(50) UNIQUE NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        class_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // BOOK INVENTORY TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.book_inventory (
        inventory_id SERIAL PRIMARY KEY,
        book_id INTEGER NOT NULL REFERENCES public.books(book_id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 0,
        available_quantity INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (book_id)
      )
    `);

    // RESERVATIONS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.reservations (
        reservation_id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
        book_id INTEGER NOT NULL REFERENCES public.books(book_id) ON DELETE CASCADE,
        school_id INTEGER NOT NULL REFERENCES public.schools(school_id) ON DELETE CASCADE,
        status VARCHAR(50) NOT NULL DEFAULT 'reserved',
        reserved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        due_date TIMESTAMP,
        returned_at TIMESTAMP
      )
    `);

    // INDEXES - USERS
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_${schemaName}_users_user_id
      ON ${schemaName}.users (user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_${schemaName}_users_email
      ON ${schemaName}.users (email)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_${schemaName}_users_school_id
      ON ${schemaName}.users (school_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_${schemaName}_users_role
      ON ${schemaName}.users (user_role)
    `);

    // INDEXES - BOOK INVENTORY
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_${schemaName}_book_inventory_book_id
      ON ${schemaName}.book_inventory (book_id)
    `);

    // INDEXES - RESERVATIONS
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_${schemaName}_reservations_user_id
      ON ${schemaName}.reservations (user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_${schemaName}_reservations_book_id
      ON ${schemaName}.reservations (book_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_${schemaName}_reservations_school_id
      ON ${schemaName}.reservations (school_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_${schemaName}_reservations_status
      ON ${schemaName}.reservations (status)
    `);

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: `School created successfully: ${schemaName}`,
      data: {
        school_id: school.school_id,
        school_code: school.school_code,
        school_name: school.school_name,
        schema_name: schemaName,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

const getSchools = async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT * FROM schools ORDER BY school_id DESC"
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

const createTeacher = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { schoolId } = req.params;
    const { user_name, user_surname, email, password } = req.body;

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "schoolId zorunlu",
      });
    }

    if (!user_name || !user_surname || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "user_name, user_surname, email ve password zorunlu",
      });
    }

    await client.query("BEGIN");

    const schoolResult = await client.query(
      "SELECT * FROM schools WHERE school_id = $1 LIMIT 1",
      [schoolId]
    );

    if (schoolResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Okul bulunamadı",
      });
    }

    const school = schoolResult.rows[0];
    const schemaName = `school_${school.school_code}`;

    const existingUser = await client.query(
      "SELECT * FROM users WHERE email = $1 LIMIT 1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Bu email ile kayıtlı kullanıcı zaten var",
      });
    }

    const userInsert = await client.query(
      `
      INSERT INTO users
      (user_name, user_surname, email, password, user_role, student_id, user_class, user_class_code, school_id)
      VALUES ($1, $2, $3, $4, 'teacher', NULL, NULL, NULL, $5)
      RETURNING *
      `,
      [user_name, user_surname, email, password, school.school_id]
    );

    const createdUser = userInsert.rows[0];

    await client.query(
      `
      INSERT INTO ${schemaName}.users
      (user_id, user_name, user_surname, email, password, user_role, student_id, user_class, user_class_code, school_id)
      VALUES ($1, $2, $3, $4, $5, 'teacher', NULL, NULL, NULL, $6)
      `,
      [
        createdUser.user_id,
        createdUser.user_name,
        createdUser.user_surname,
        createdUser.email,
        createdUser.password,
        createdUser.school_id,
      ]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "Öğretmen oluşturuldu",
      data: createdUser,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

const getSchoolTeachers = async (req, res, next) => {
  try {
    const { schoolId } = req.params;

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "schoolId zorunlu",
      });
    }

    const schoolResult = await pool.query(
      "SELECT * FROM schools WHERE school_id = $1 LIMIT 1",
      [schoolId]
    );

    if (schoolResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Okul bulunamadı",
      });
    }

    const result = await pool.query(
      `
      SELECT user_id, user_name, user_surname, email, user_role, school_id
      FROM users
      WHERE school_id = $1 AND user_role = 'teacher'
      ORDER BY user_id DESC
      `,
      [schoolId]
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

const deleteTeacher = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { schoolId, teacherId } = req.params;

    if (!schoolId || !teacherId) {
      return res.status(400).json({
        success: false,
        message: "schoolId ve teacherId zorunlu",
      });
    }

    await client.query("BEGIN");

    const schoolResult = await client.query(
      "SELECT * FROM schools WHERE school_id = $1 LIMIT 1",
      [schoolId]
    );

    if (schoolResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Okul bulunamadı",
      });
    }

    const school = schoolResult.rows[0];
    const schemaName = `school_${school.school_code}`;

    const teacherResult = await client.query(
      `
      SELECT * FROM users
      WHERE user_id = $1 AND school_id = $2 AND user_role = 'teacher'
      LIMIT 1
      `,
      [teacherId, schoolId]
    );

    if (teacherResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Öğretmen bulunamadı",
      });
    }

    await client.query(
      `DELETE FROM ${schemaName}.users WHERE user_id = $1`,
      [teacherId]
    );

    await client.query(
      `DELETE FROM users WHERE user_id = $1`,
      [teacherId]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Öğretmen silindi",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

module.exports = {
  createSchool,
  getSchools,
  createTeacher,
  getSchoolTeachers,
  deleteTeacher,
};