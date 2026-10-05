const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(cors());

app.use(
    express.json({
        limit: "10mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "10mb"
    })
);


/* =========================================================
   DIRECTORIES
========================================================= */

const ROOT_DIR = __dirname;
const PAGES_DIR = path.join(__dirname, "pages");
const CSS_DIR = path.join(__dirname, "css");
const JS_DIR = path.join(__dirname, "js");

app.use(express.static(ROOT_DIR));
app.use("/css", express.static(CSS_DIR));
app.use("/js", express.static(JS_DIR));
app.use("/pages", express.static(PAGES_DIR));


/* =========================================================
   DATABASE
========================================================= */

const dbPath = path.join(__dirname, "shadab_rental.db");

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Database connection error:", err.message);
    } else {
        console.log("SQLite database connected.");
    }
});


/* =========================================================
   DATABASE TABLES
========================================================= */

db.serialize(() => {

    db.run(`
        CREATE TABLE IF NOT EXISTS owners (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS equipment (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            equipment_id TEXT UNIQUE NOT NULL,
            owner_id INTEGER NOT NULL,
            owner_name TEXT NOT NULL,
            owner_phone TEXT NOT NULL,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            location TEXT NOT NULL,
            price REAL NOT NULL,
            description TEXT,
            image TEXT,
            status TEXT DEFAULT 'Pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (owner_id) REFERENCES owners(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS rental_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id TEXT UNIQUE NOT NULL,
            equipment_id TEXT NOT NULL,
            customer_name TEXT NOT NULL,
            customer_phone TEXT NOT NULL,
            company_name TEXT,
            required_location TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            notes TEXT,
            status TEXT DEFAULT 'Pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

});


/* =========================================================
   HELPER FUNCTIONS
========================================================= */

function generateEquipmentId(index = 0) {
    return (
        "EQ-" +
        Date.now() +
        "-" +
        index +
        "-" +
        Math.random()
            .toString(36)
            .substring(2, 7)
            .toUpperCase()
    );
}

function generateRequestId() {
    return (
        "REQ-" +
        Date.now() +
        "-" +
        Math.random()
            .toString(36)
            .substring(2, 7)
            .toUpperCase()
    );
}

function cleanValue(value) {
    if (value === undefined || value === null) {
        return "";
    }

    return String(value).trim();
}

function normalizeEquipmentRow(row) {

    const normalized = {};

    Object.keys(row || {}).forEach((key) => {

        const cleanKey = String(key)
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "")
            .replace(/[_-]/g, "");

        normalized[cleanKey] = row[key];

    });

    return {
        name:
            normalized.equipmentname ||
            normalized.name ||
            normalized.equipment ||
            "",

        category:
            normalized.category ||
            normalized.equipmentcategory ||
            "",

        location:
            normalized.location ||
            normalized.city ||
            "",

        price:
            normalized.rentalpriceday ||
            normalized.rentalprice ||
            normalized.price ||
            normalized.priceday ||
            "",

        description:
            normalized.description ||
            normalized.details ||
            "",

        image:
            normalized.imageurl ||
            normalized.image ||
            normalized.photourl ||
            ""
    };
}


/* =========================================================
   API HEALTH
========================================================= */

app.get("/api", (req, res) => {

    res.json({
        success: true,
        message: "SHADAB CITY RENTAL API is running",
        status: "online"
    });

});


/* =========================================================
   OWNER REGISTER
========================================================= */

app.post("/api/owners/register", async (req, res) => {

    try {

        const name = cleanValue(req.body.name);
        const phone = cleanValue(req.body.phone);
        const password = cleanValue(req.body.password);

        if (!name || !phone || !password) {

            return res.status(400).json({
                success: false,
                message: "Name, phone and password are required."
            });

        }

        if (password.length < 6) {

            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters."
            });

        }

        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(
            `
            INSERT INTO owners
            (name, phone, password)
            VALUES (?, ?, ?)
            `,
            [name, phone, hashedPassword],
            function (err) {

                if (err) {

                    if (err.message.includes("UNIQUE")) {

                        return res.status(409).json({
                            success: false,
                            message: "This phone number is already registered."
                        });

                    }

                    console.error(err);

                    return res.status(500).json({
                        success: false,
                        message: "Registration failed."
                    });

                }

                res.json({
                    success: true,
                    message: "Owner registered successfully.",
                    owner: {
                        id: this.lastID,
                        name,
                        phone
                    }
                });

            }
        );

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Server error."
        });

    }

});


/* =========================================================
   OWNER LOGIN
========================================================= */

app.post("/api/owners/login", (req, res) => {

    const phone = cleanValue(req.body.phone);
    const password = cleanValue(req.body.password);

    if (!phone || !password) {

        return res.status(400).json({
            success: false,
            message: "Phone and password are required."
        });

    }

    db.get(
        `
        SELECT *
        FROM owners
        WHERE phone = ?
        `,
        [phone],
        async (err, owner) => {

            if (err) {

                console.error(err);

                return res.status(500).json({
                    success: false,
                    message: "Login failed."
                });

            }

            if (!owner) {

                return res.status(401).json({
                    success: false,
                    message: "Invalid phone number or password."
                });

            }

            const passwordMatch = await bcrypt.compare(
                password,
                owner.password
            );

            if (!passwordMatch) {

                return res.status(401).json({
                    success: false,
                    message: "Invalid phone number or password."
                });

            }

            res.json({
                success: true,
                message: "Login successful.",
                owner: {
                    id: owner.id,
                    name: owner.name,
                    phone: owner.phone
                }
            });

        }
    );

});


/* =========================================================
   ADD SINGLE EQUIPMENT
========================================================= */

app.post("/api/equipment", (req, res) => {

    const ownerId = cleanValue(req.body.ownerId);
    const ownerName = cleanValue(req.body.ownerName);
    const ownerPhone = cleanValue(req.body.ownerPhone);

    const name = cleanValue(req.body.name);
    const category = cleanValue(req.body.category);
    const location = cleanValue(req.body.location);

    const price = Number(req.body.price);

    const description = cleanValue(req.body.description);
    const image = cleanValue(req.body.image);

    if (
        !ownerId ||
        !ownerName ||
        !ownerPhone ||
        !name ||
        !category ||
        !location ||
        !Number.isFinite(price) ||
        price <= 0
    ) {

        return res.status(400).json({
            success: false,
            message: "Please provide all required equipment details."
        });

    }

    db.get(
        `
        SELECT id, name, phone
        FROM owners
        WHERE id = ?
        `,
        [ownerId],
        (err, owner) => {

            if (err) {

                console.error(err);

                return res.status(500).json({
                    success: false,
                    message: "Database error."
                });

            }

            if (!owner) {

                return res.status(404).json({
                    success: false,
                    message: "Owner account not found."
                });

            }

            const equipmentId = generateEquipmentId();

            db.run(
                `
                INSERT INTO equipment
                (
                    equipment_id,
                    owner_id,
                    owner_name,
                    owner_phone,
                    name,
                    category,
                    location,
                    price,
                    description,
                    image,
                    status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')
                `,
                [
                    equipmentId,
                    owner.id,
                    owner.name,
                    owner.phone,
                    name,
                    category,
                    location,
                    price,
                    description,
                    image
                ],
                function (insertErr) {

                    if (insertErr) {

                        console.error(insertErr);

                        return res.status(500).json({
                            success: false,
                            message: "Equipment could not be added."
                        });

                    }

                    res.json({
                        success: true,
                        message:
                            "Equipment submitted successfully. Waiting for admin approval.",
                        equipmentId
                    });

                }
            );

        }
    );

});


/* =========================================================
   BULK EQUIPMENT UPLOAD
   Excel / CSV -> rows -> database
========================================================= */

app.post("/api/equipment/bulk", async (req, res) => {

    try {

        const ownerId = cleanValue(req.body.ownerId);
        const rows = Array.isArray(req.body.rows)
            ? req.body.rows
            : [];

        if (!ownerId) {

            return res.status(400).json({
                success: false,
                message: "Owner ID is required."
            });

        }

        if (!rows.length) {

            return res.status(400).json({
                success: false,
                message: "No equipment rows were received."
            });

        }

        if (rows.length > 2000) {

            return res.status(400).json({
                success: false,
                message: "Maximum 2000 equipment records can be uploaded at once."
            });

        }

        db.get(
            `
            SELECT id, name, phone
            FROM owners
            WHERE id = ?
            `,
            [ownerId],
            async (ownerErr, owner) => {

                if (ownerErr) {

                    console.error(ownerErr);

                    return res.status(500).json({
                        success: false,
                        message: "Database error while checking owner."
                    });

                }

                if (!owner) {

                    return res.status(404).json({
                        success: false,
                        message: "Owner account not found."
                    });

                }

                const validRows = [];
                const errors = [];

                rows.forEach((rawRow, index) => {

                    const row = normalizeEquipmentRow(rawRow);

                    const name = cleanValue(row.name);
                    const category = cleanValue(row.category);
                    const location = cleanValue(row.location);
                    const description = cleanValue(row.description);
                    const image = cleanValue(row.image);

                    const price = Number(
                        String(row.price)
                            .replace(/,/g, "")
                            .replace(/[^\d.-]/g, "")
                    );

                    const rowNumber = index + 2;

                    const rowErrors = [];

                    if (!name) {
                        rowErrors.push("Equipment Name is missing");
                    }

                    if (!category) {
                        rowErrors.push("Category is missing");
                    }

                    if (!location) {
                        rowErrors.push("Location is missing");
                    }

                    if (!Number.isFinite(price) || price <= 0) {
                        rowErrors.push("Rental Price/Day is invalid");
                    }

                    if (rowErrors.length) {

                        errors.push({
                            row: rowNumber,
                            errors: rowErrors
                        });

                    } else {

                        validRows.push({
                            name,
                            category,
                            location,
                            price,
                            description,
                            image
                        });

                    }

                });


                if (errors.length) {

                    return res.status(400).json({
                        success: false,
                        message:
                            "Some rows contain errors. Please correct the Excel/CSV file and upload again.",
                        errors,
                        validCount: validRows.length,
                        errorCount: errors.length
                    });

                }


                /* -------------------------------------------------
                   Sequential database insertion
                ------------------------------------------------- */

                const insertRow = (index) => {

                    return new Promise((resolve, reject) => {

                        if (index >= validRows.length) {
                            return resolve();
                        }

                        const row = validRows[index];

                        const equipmentId = generateEquipmentId(index);

                        db.run(
                            `
                            INSERT INTO equipment
                            (
                                equipment_id,
                                owner_id,
                                owner_name,
                                owner_phone,
                                name,
                                category,
                                location,
                                price,
                                description,
                                image,
                                status
                            )
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')
                            `,
                            [
                                equipmentId,
                                owner.id,
                                owner.name,
                                owner.phone,
                                row.name,
                                row.category,
                                row.location,
                                row.price,
                                row.description,
                                row.image
                            ],
                            (insertErr) => {

                                if (insertErr) {
                                    return reject(insertErr);
                                }

                                insertRow(index + 1)
                                    .then(resolve)
                                    .catch(reject);

                            }
                        );

                    });

                };


                try {

                    await insertRow(0);

                    res.json({
                        success: true,
                        message:
                            `${validRows.length} equipment records submitted successfully.`,
                        inserted: validRows.length,
                        status: "Pending"
                    });

                } catch (insertError) {

                    console.error("Bulk insert error:", insertError);

                    res.status(500).json({
                        success: false,
                        message:
                            "Bulk upload failed while saving equipment."
                    });

                }

            }
        );

    } catch (error) {

        console.error("Bulk upload error:", error);

        res.status(500).json({
            success: false,
            message: "Server error during bulk upload."
        });

    }

});


/* =========================================================
   GET APPROVED EQUIPMENT
========================================================= */

app.get("/api/equipment", (req, res) => {

    const search = cleanValue(req.query.search);
    const category = cleanValue(req.query.category);
    const location = cleanValue(req.query.location);

    let sql = `
        SELECT *
        FROM equipment
        WHERE status = 'Approved'
    `;

    const params = [];

    if (search) {

        sql += `
            AND (
                name LIKE ?
                OR category LIKE ?
                OR location LIKE ?
                OR description LIKE ?
            )
        `;

        const searchValue = `%${search}%`;

        params.push(
            searchValue,
            searchValue,
            searchValue,
            searchValue
        );

    }

    if (category) {

        sql += `
            AND category LIKE ?
        `;

        params.push(`%${category}%`);

    }

    if (location) {

        sql += `
            AND location LIKE ?
        `;

        params.push(`%${location}%`);

    }

    sql += `
        ORDER BY created_at DESC
    `;

    db.all(
        sql,
        params,
        (err, rows) => {

            if (err) {

                console.error(err);

                return res.status(500).json({
                    success: false,
                    message: "Could not load equipment."
                });

            }

            res.json({
                success: true,
                equipment: rows
            });

        }
    );

});


/* =========================================================
   ADMIN - ALL EQUIPMENT
========================================================= */

app.get("/api/admin/equipment", (req, res) => {

    db.all(
        `
        SELECT *
        FROM equipment
        ORDER BY created_at DESC
        `,
        [],
        (err, rows) => {

            if (err) {

                console.error(err);

                return res.status(500).json({
                    success: false,
                    message: "Could not load admin equipment."
                });

            }

            res.json({
                success: true,
                equipment: rows
            });

        }
    );

});


/* =========================================================
   ADMIN - APPROVE EQUIPMENT
========================================================= */

app.put("/api/admin/equipment/:id/approve", (req, res) => {

    const id = req.params.id;

    db.run(
        `
        UPDATE equipment
        SET status = 'Approved'
        WHERE id = ?
        `,
        [id],
        function (err) {

            if (err) {

                console.error(err);

                return res.status(500).json({
                    success: false,
                    message: "Approval failed."
                });

            }

            res.json({
                success: true,
                message: "Equipment approved successfully."
            });

        }
    );

});


/* =========================================================
   ADMIN - REJECT EQUIPMENT
========================================================= */

app.put("/api/admin/equipment/:id/reject", (req, res) => {

    const id = req.params.id;

    db.run(
        `
        UPDATE equipment
        SET status = 'Rejected'
        WHERE id = ?
        `,
        [id],
        function (err) {

            if (err) {

                console.error(err);

                return res.status(500).json({
                    success: false,
                    message: "Rejection failed."
                });

            }

            res.json({
                success: true,
                message: "Equipment rejected."
            });

        }
    );

});


/* =========================================================
   ADMIN - REVIEW EQUIPMENT
========================================================= */

app.put("/api/admin/equipment/:id/review", (req, res) => {

    const id = req.params.id;

    db.run(
        `
        UPDATE equipment
        SET status = 'Under Review'
        WHERE id = ?
        `,
        [id],
        function (err) {

            if (err) {

                console.error(err);

                return res.status(500).json({
                    success: false,
                    message: "Review status update failed."
                });

            }

            res.json({
                success: true,
                message: "Equipment marked as Under Review."
            });

        }
    );

});


/* =========================================================
   ADMIN - DELETE EQUIPMENT
========================================================= */

app.delete("/api/admin/equipment/:id", (req, res) => {

    const id = req.params.id;

    db.run(
        `
        DELETE FROM equipment
        WHERE id = ?
        `,
        [id],
        function (err) {

            if (err) {

                console.error(err);

                return res.status(500).json({
                    success: false,
                    message: "Equipment deletion failed."
                });

            }

            res.json({
                success: true,
                message: "Equipment deleted successfully."
            });

        }
    );

});


/* =========================================================
   CREATE RENTAL REQUEST
========================================================= */

app.post("/api/rental-requests", (req, res) => {

    const equipmentId = cleanValue(req.body.equipmentId);
    const customerName = cleanValue(req.body.customerName);
    const customerPhone = cleanValue(req.body.customerPhone);
    const companyName = cleanValue(req.body.companyName);
    const requiredLocation = cleanValue(req.body.requiredLocation);
    const startDate = cleanValue(req.body.startDate);
    const endDate = cleanValue(req.body.endDate);
    const notes = cleanValue(req.body.notes);

    if (
        !equipmentId ||
        !customerName ||
        !customerPhone ||
        !requiredLocation ||
        !startDate ||
        !endDate
    ) {

        return res.status(400).json({
            success: false,
            message: "Please provide all required rental details."
        });

    }

    db.get(
        `
        SELECT *
        FROM equipment
        WHERE equipment_id = ?
        AND status = 'Approved'
        `,
        [equipmentId],
        (err, equipment) => {

            if (err) {

                console.error(err);

                return res.status(500).json({
                    success: false,
                    message: "Database error."
                });

            }

            if (!equipment) {

                return res.status(404).json({
                    success: false,
                    message:
                        "This equipment is not available for rental."
                });

            }

            const requestId = generateRequestId();

            db.run(
                `
                INSERT INTO rental_requests
                (
                    request_id,
                    equipment_id,
                    customer_name,
                    customer_phone,
                    company_name,
                    required_location,
                    start_date,
                    end_date,
                    notes,
                    status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')
                `,
                [
                    requestId,
                    equipmentId,
                    customerName,
                    customerPhone,
                    companyName,
                    requiredLocation,
                    startDate,
                    endDate,
                    notes
                ],
                function (insertErr) {

                    if (insertErr) {

                        console.error(insertErr);

                        return res.status(500).json({
                            success: false,
                            message: "Rental request failed."
                        });

                    }

                    res.json({
                        success: true,
                        message:
                            "Rental request submitted successfully.",
                        requestId
                    });

                }
            );

        }
    );

});


/* =========================================================
   TRACK RENTAL REQUEST
========================================================= */

app.get("/api/rental-requests/track", (req, res) => {

    const requestId = cleanValue(req.query.requestId);

    if (!requestId) {

        return res.status(400).json({
            success: false,
            message: "Request ID is required."
        });

    }

    db.get(
        `
        SELECT *
        FROM rental_requests
        WHERE request_id = ?
        `,
        [requestId],
        (err, request) => {

            if (err) {

                console.error(err);

                return res.status(500).json({
                    success: false,
                    message: "Could not track request."
                });

            }

            if (!request) {

                return res.status(404).json({
                    success: false,
                    message: "Rental request not found."
                });

            }

            res.json({
                success: true,
                request
            });

        }
    );

});


/* =========================================================
   ADMIN - ALL RENTAL REQUESTS
========================================================= */

app.get("/api/admin/rental-requests", (req, res) => {

    db.all(
        `
        SELECT
            rental_requests.*,
            equipment.name AS equipment_name,
            equipment.category AS equipment_category,
            equipment.location AS equipment_location,
            equipment.price AS equipment_price,
            equipment.owner_name,
            equipment.owner_phone
        FROM rental_requests
        LEFT JOIN equipment
            ON rental_requests.equipment_id = equipment.equipment_id
        ORDER BY rental_requests.created_at DESC
        `,
        [],
        (err, rows) => {

            if (err) {

                console.error(err);

                return res.status(500).json({
                    success: false,
                    message: "Could not load rental requests."
                });

            }

            res.json({
                success: true,
                requests: rows
            });

        }
    );

});


/* =========================================================
   ADMIN - DELETE RENTAL REQUEST
========================================================= */

app.delete("/api/admin/rental-requests/:id", (req, res) => {

    const id = req.params.id;

    db.run(
        `
        DELETE FROM rental_requests
        WHERE id = ?
        `,
        [id],
        function (err) {

            if (err) {

                console.error(err);

                return res.status(500).json({
                    success: false,
                    message: "Request deletion failed."
                });

            }

            res.json({
                success: true,
                message: "Rental request deleted."
            });

        }
    );

});


/* =========================================================
   OWNER - EQUIPMENT
========================================================= */

app.get("/api/owner/:ownerId/equipment", (req, res) => {

    const ownerId = req.params.ownerId;

    db.all(
        `
        SELECT *
        FROM equipment
        WHERE owner_id = ?
        ORDER BY created_at DESC
        `,
        [ownerId],
        (err, rows) => {

            if (err) {

                console.error(err);

                return res.status(500).json({
                    success: false,
                    message: "Could not load owner equipment."
                });

            }

            res.json({
                success: true,
                equipment: rows
            });

        }
    );

});


/* =========================================================
   OWNER - RENTAL REQUESTS
========================================================= */

app.get("/api/owner/:ownerId/requests", (req, res) => {

    const ownerId = req.params.ownerId;

    db.all(
        `
        SELECT
            rental_requests.*,
            equipment.name AS equipment_name,
            equipment.category AS equipment_category,
            equipment.price AS equipment_price,
            equipment.owner_name,
            equipment.owner_phone
        FROM rental_requests
        INNER JOIN equipment
            ON rental_requests.equipment_id = equipment.equipment_id
        WHERE equipment.owner_id = ?
        ORDER BY rental_requests.created_at DESC
        `,
        [ownerId],
        (err, rows) => {

            if (err) {

                console.error(err);

                return res.status(500).json({
                    success: false,
                    message: "Could not load owner requests."
                });

            }

            res.json({
                success: true,
                requests: rows
            });

        }
    );

});


/* =========================================================
   OWNER - CONFIRM RENTAL
========================================================= */

app.put("/api/rental-requests/:id/confirm", (req, res) => {

    const id = req.params.id;

    db.run(
        `
        UPDATE rental_requests
        SET status = 'Confirmed'
        WHERE id = ?
        `,
        [id],
        function (err) {

            if (err) {

                console.error(err);

                return res.status(500).json({
                    success: false,
                    message: "Could not confirm request."
                });

            }

            res.json({
                success: true,
                message: "Rental request confirmed."
            });

        }
    );

});


/* =========================================================
   OWNER - REJECT RENTAL
========================================================= */

app.put("/api/rental-requests/:id/reject", (req, res) => {

    const id = req.params.id;

    db.run(
        `
        UPDATE rental_requests
        SET status = 'Rejected'
        WHERE id = ?
        `,
        [id],
        function (err) {

            if (err) {

                console.error(err);

                return res.status(500).json({
                    success: false,
                    message: "Could not reject request."
                });

            }

            res.json({
                success: true,
                message: "Rental request rejected."
            });

        }
    );

});


/* =========================================================
   OWNER - COMPLETE RENTAL
========================================================= */

app.put("/api/rental-requests/:id/complete", (req, res) => {

    const id = req.params.id;

    db.run(
        `
        UPDATE rental_requests
        SET status = 'Completed'
        WHERE id = ?
        `,
        [id],
        function (err) {

            if (err) {

                console.error(err);

                return res.status(500).json({
                    success: false,
                    message: "Could not complete rental."
                });

            }

            res.json({
                success: true,
                message: "Rental marked as completed."
            });

        }
    );

});


/* =========================================================
   PAGE ROUTES
========================================================= */

app.get("/pages/:file", (req, res) => {

    const fileName = path.basename(req.params.file);
    const filePath = path.join(PAGES_DIR, fileName);

    res.sendFile(filePath, (err) => {

        if (err) {

            res.status(404).send("Page not found.");

        }

    });

});


/* =========================================================
   HOME PAGE
========================================================= */

app.get("/", (req, res) => {

    res.sendFile(
        path.join(ROOT_DIR, "index.html"),
        (err) => {

            if (err) {

                res.status(404).send(
                    "SHADAB CITY RENTAL homepage not found."
                );

            }

        }
    );

});


/* =========================================================
   404 API HANDLER
========================================================= */

app.use("/api", (req, res) => {

    res.status(404).json({
        success: false,
        message: "API endpoint not found."
    });

});


/* =========================================================
   START SERVER
========================================================= */

app.listen(PORT, () => {

    console.log("");
    console.log("==============================================");
    console.log("   SHADAB CITY RENTAL SERVER");
    console.log("==============================================");
    console.log(`   Server running on port ${PORT}`);
    console.log(`   http://localhost:${PORT}`);
    console.log("==============================================");
    console.log("");

});