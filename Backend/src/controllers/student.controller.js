const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

function signStudentToken(user) {
  return jwt.sign(
    {
      user_id: user.user_id,
      school_id: user.school_id,
      school_code: user.school_code,
      role: user.user_role,
      student_number: user.student_id,
    },
    process.env.JWT_SECRET || "dev_secret",
    { expiresIn: "7d" }
  );
}

const registerStudent = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const {
      schoolCode,
      user_name,
      user_surname,
      student_number,
      password,
      user_class,
      user_class_code,
    } = req.body;

    if (
      !schoolCode ||
      !user_name ||
      !user_surname ||
      !student_number ||
      !password ||
      !user_class ||
      !user_class_code
    ) {
      return res.status(400).json({
        success: false,
        message:
          "schoolCode, user_name, user_surname, student_number, password, user_class ve user_class_code zorunlu",
      });
    }

    await client.query("BEGIN");

    const schoolResult = await client.query(
      "SELECT * FROM public.schools WHERE school_code = $1 LIMIT 1",
      [schoolCode]
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
    const fullName = `${user_name} ${user_surname}`.trim();

    const existingUser = await client.query(
      `
      SELECT user_id
      FROM public.users
      WHERE school_id = $1
        AND user_role = 'student'
        AND student_id = $2
      LIMIT 1
      `,
      [school.school_id, student_number]
    );

    if (existingUser.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Bu öğrenci numarasıyla kayıtlı öğrenci zaten var",
      });
    }

    const hashedPassword = await bcrypt.hash(String(password), 10);

    const userInsert = await client.query(
      `
      INSERT INTO public.users
      (
        user_name,
        user_surname,
        user_role,
        student_id,
        user_class,
        user_class_code,
        school_id,
        email,
        password
      )
      VALUES ($1, $2, 'student', $3, $4, $5, $6, NULL, $7)
      RETURNING
        user_id,
        user_name,
        user_surname,
        user_role,
        student_id,
        user_class,
        user_class_code,
        school_id
      `,
      [
        user_name,
        user_surname,
        student_number,
        user_class,
        user_class_code,
        school.school_id,
        hashedPassword,
      ]
    );

    const createdUser = userInsert.rows[0];

    await client.query(
      `
      INSERT INTO ${schemaName}.users
      (
        user_id,
        user_name,
        user_surname,
        email,
        password,
        user_role,
        student_id,
        user_class,
        user_class_code,
        school_id
      )
      VALUES ($1, $2, $3, NULL, $4, 'student', $5, $6, $7, $8)
      `,
      [
        createdUser.user_id,
        createdUser.user_name,
        createdUser.user_surname,
        hashedPassword,
        student_number,
        user_class,
        user_class_code,
        school.school_id,
      ]
    );

    await client.query(
      `
      INSERT INTO ${schemaName}.students
      (
        student_number,
        full_name,
        class_name,
        class_code
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (student_number)
      DO UPDATE SET
        full_name = EXCLUDED.full_name,
        class_name = EXCLUDED.class_name,
        class_code = EXCLUDED.class_code
      `,
      [student_number, fullName, user_class, user_class_code]
    );

    await client.query("COMMIT");

    const token = signStudentToken({
      ...createdUser,
      school_code: school.school_code,
    });

    return res.status(201).json({
      success: true,
      message: "Öğrenci kaydı oluşturuldu",
      token,
      data: {
        ...createdUser,
        school_code: school.school_code,
        school_name: school.school_name,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

const loginStudent = async (req, res, next) => {
  try {
    const { schoolCode, student_number, password } = req.body;

    if (!schoolCode || !student_number || !password) {
      return res.status(400).json({
        success: false,
        message: "schoolCode, student_number ve password zorunlu",
      });
    }

    const result = await pool.query(
      `
      SELECT
        u.*,
        s.school_code,
        s.school_name
      FROM public.users u
      JOIN public.schools s ON s.school_id = u.school_id
      WHERE s.school_code = $1
        AND u.user_role = 'student'
        AND u.student_id = $2
      LIMIT 1
      `,
      [schoolCode, student_number]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Öğrenci bulunamadı",
      });
    }

    const user = result.rows[0];

    const passwordOk = await bcrypt.compare(String(password), user.password || "");

    if (!passwordOk) {
      return res.status(401).json({
        success: false,
        message: "Şifre hatalı",
      });
    }

    const token = signStudentToken(user);

    return res.status(200).json({
      success: true,
      message: "Giriş başarılı",
      token,
      data: {
        user_id: user.user_id,
        user_name: user.user_name,
        user_surname: user.user_surname,
        user_role: user.user_role,
        student_number: user.student_id,
        user_class: user.user_class,
        user_class_code: user.user_class_code,
        school_id: user.school_id,
        school_code: user.school_code,
        school_name: user.school_name,
      },
    });
  } catch (error) {
    next(error);
  }
};

const createStudentReservation = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { book_id } = req.body;
    const { user_id, school_id, school_code } = req.user;

    if (!book_id) {
      return res.status(400).json({
        success: false,
        message: "book_id zorunlu",
      });
    }

    const schemaName = `school_${school_code}`;

    await client.query("BEGIN");

    const bookResult = await client.query(
      `
      SELECT *
      FROM ${schemaName}.book_inventory
      WHERE book_id = $1
      FOR UPDATE
      `,
      [book_id]
    );

    if (bookResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Kitap okul envanterinde bulunamadı",
      });
    }

    const inventory = bookResult.rows[0];

    if (inventory.available_quantity <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Bu kitap şu anda müsait değil",
      });
    }

    const activeReservation = await client.query(
      `
      SELECT reservation_id
      FROM ${schemaName}.reservations
      WHERE user_id = $1
        AND book_id = $2
        AND status IN ('reserved', 'loaned')
      LIMIT 1
      `,
      [user_id, book_id]
    );

    if (activeReservation.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Bu kitap için zaten aktif rezervasyonun var",
      });
    }

    const publicReservation = await client.query(
      `
      INSERT INTO public.reservations
      (
        user_id,
        book_id,
        school_id,
        reservation_date,
        reservation_status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP, 'reserved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
      `,
      [user_id, book_id, school_id]
    );

    const schoolReservation = await client.query(
      `
      INSERT INTO ${schemaName}.reservations
      (
        user_id,
        book_id,
        school_id,
        status,
        reserved_at
      )
      VALUES ($1, $2, $3, 'reserved', CURRENT_TIMESTAMP)
      RETURNING *
      `,
      [user_id, book_id, school_id]
    );

    await client.query(
      `
      UPDATE ${schemaName}.book_inventory
      SET available_quantity = available_quantity - 1
      WHERE book_id = $1
      `,
      [book_id]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "Kitap rezerve edildi",
      data: {
        publicReservation: publicReservation.rows[0],
        schoolReservation: schoolReservation.rows[0],
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

const getMyReservations = async (req, res, next) => {
  try {
    const { user_id, school_code } = req.user;
    const schemaName = `school_${school_code}`;

    const result = await pool.query(
      `
      SELECT
        r.*,
        b.book_name,
        b.book_writer,
        b.publisher,
        b.isbn
      FROM ${schemaName}.reservations r
      JOIN public.books b ON b.book_id = r.book_id
      WHERE r.user_id = $1
      ORDER BY r.reserved_at DESC
      `,
      [user_id]
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerStudent,
  loginStudent,
  createStudentReservation,
  getMyReservations,
};