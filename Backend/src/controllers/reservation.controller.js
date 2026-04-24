const pool = require("../config/db");

const getAllReservations = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT 
        r.*,
        u.user_name,
        u.user_surname,
        u.school_id AS user_school_id,
        b.book_name,
        b.book_writer
      FROM reservations r
      JOIN users u ON r.user_id = u.user_id
      JOIN books b ON r.book_id = b.book_id
      ORDER BY r.reservation_id ASC
    `);

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

const getReservationById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM reservations WHERE reservation_id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Reservation not found",
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

const createReservation = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { user_id, book_id, due_date } = req.body;

    if (!user_id || !book_id) {
      return res.status(400).json({
        success: false,
        message: "user_id and book_id are required",
      });
    }

    await client.query("BEGIN");

    const userResult = await client.query(
      "SELECT * FROM users WHERE user_id = $1",
      [user_id]
    );

    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = userResult.rows[0];

    if (!user.school_id) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "User has no school_id",
      });
    }

    const bookResult = await client.query(
      "SELECT * FROM books WHERE book_id = $1 FOR UPDATE",
      [book_id]
    );

    if (bookResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    const book = bookResult.rows[0];

    if (book.book_available_quantity <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Book is not available",
      });
    }

    const reservationResult = await client.query(
      `INSERT INTO reservations
      (user_id, book_id, school_id, reservation_date, reservation_status, created_at, updated_at, due_date)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP, 'reserved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $4)
      RETURNING *`,
      [user_id, book_id, user.school_id, due_date || null]
    );

    await client.query(
      `UPDATE books
       SET book_available_quantity = book_available_quantity - 1
       WHERE book_id = $1`,
      [book_id]
    );

    const schoolResult = await client.query(
      "SELECT * FROM schools WHERE school_id = $1 LIMIT 1",
      [user.school_id]
    );

    if (schoolResult.rows.length > 0) {
      const schemaName = `school_${schoolResult.rows[0].school_code}`;

      await client.query(
        `
        INSERT INTO ${schemaName}.reservations
        (user_id, book_id, school_id, status, reserved_at, due_date)
        VALUES ($1, $2, $3, 'reserved', CURRENT_TIMESTAMP, $4)
        `,
        [user_id, book_id, user.school_id, due_date || null]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Reservation created",
      data: reservationResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

const loanReservation = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query("BEGIN");

    const existing = await client.query(
      `
      SELECT r.*, s.school_code
      FROM public.reservations r
      JOIN public.schools s ON s.school_id = r.school_id
      WHERE r.reservation_id = $1
      FOR UPDATE
      `,
      [id]
    );

    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Reservation not found",
      });
    }

    const reservation = existing.rows[0];

    if (reservation.reservation_status === "loaned") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Reservation already loaned",
      });
    }

    if (reservation.reservation_status === "returned") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Returned reservation cannot be loaned",
      });
    }

    const updatedPublic = await client.query(
      `
      UPDATE public.reservations
      SET reservation_status = 'loaned',
          loaned_date = CURRENT_TIMESTAMP,
          due_date = CURRENT_TIMESTAMP + INTERVAL '15 days',
          updated_at = CURRENT_TIMESTAMP
      WHERE reservation_id = $1
      RETURNING *
      `,
      [id]
    );

    const schemaName = `school_${reservation.school_code}`;

    await client.query(
      `
      UPDATE ${schemaName}.reservations
      SET status = 'loaned',
          due_date = CURRENT_TIMESTAMP + INTERVAL '15 days'
      WHERE user_id = $1
        AND book_id = $2
        AND school_id = $3
        AND status = 'reserved'
      `,
      [reservation.user_id, reservation.book_id, reservation.school_id]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Reservation loaned",
      data: updatedPublic.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

const returnReservation = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query("BEGIN");

    const reservationResult = await client.query(
      "SELECT * FROM reservations WHERE reservation_id = $1 FOR UPDATE",
      [id]
    );

    if (reservationResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Reservation not found",
      });
    }

    const reservation = reservationResult.rows[0];

    if (reservation.reservation_status === "returned") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Book already returned",
      });
    }

    const updatedReservation = await client.query(
      `UPDATE reservations
       SET reservation_status = 'returned',
           returned_date = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE reservation_id = $1
       RETURNING *`,
      [id]
    );

    await client.query(
      `UPDATE books
       SET book_available_quantity = book_available_quantity + 1
       WHERE book_id = $1`,
      [reservation.book_id]
    );

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      message: "Book returned",
      data: updatedReservation.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

const deleteReservation = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM reservations WHERE reservation_id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Reservation not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Reservation deleted",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllReservations,
  getReservationById,
  createReservation,
  loanReservation,
  returnReservation,
  deleteReservation,
};