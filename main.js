require('dotenv').config();
const express = require('express');
const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const http = require('http');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const { Pool } = require('pg');

program
  .option('-H, --host <host>', 'адреса сервера', process.env.HOST || '0.0.0.0')
  .option('-p, --port <port>', 'порт сервера', process.env.PORT || 3000)
  .option('-c, --cache <cache>', 'шлях до директорії кеша', './cache');

program.parse(process.argv);
const options = program.opts();

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
});

const cacheDir = path.resolve(options.cache);
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

const app = express();
const upload = multer({ dest: cacheDir });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Inventory API',
      version: '1.0.0',
      description: 'API для керування інвентарем з використанням PostgreSQL'
    },
    servers: [
      {
        url: `http://localhost:${options.port}`,
      }
    ]
    ,
    components: {
      schemas: {
        Item: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            title: { type: 'string' },
            description: { type: 'string' },
            photo: { type: ['string', 'null'] },
            photoUrl: { type: ['string', 'null'] }
          }
        },
        Error: {
          type: 'object',
          properties: { message: { type: 'string' } }
        }
      }
    }
  },
  apis: [path.resolve(__filename)]
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/RegisterForm.html', (req, res) =>
  res.sendFile(path.join(__dirname, 'RegisterForm.html'))
);

app.get('/SearchForm.html', (req, res) =>
  res.sendFile(path.join(__dirname, 'SearchForm.html'))
);

/**
 * @openapi
 * /register:
 *   post:
 *     tags:
 *       - Inventory
 *     summary: Створити новий елемент інвентарю
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *               photo:
 *                 type: string
 *                 format: binary
 *             required:
 *               - inventory_name
 *     responses:
 *       '201':
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Item'
 *       '400':
 *         description: Bad Request
 */
app.post('/register', upload.single('photo'), async (req, res) => {
  const { inventory_name, description } = req.body;
  if (!inventory_name) {
    return res.status(400).send('Bad Request: inventory_name is required');
  }

  try {
    const photo = req.file ? req.file.filename : null;
    const query = 'INSERT INTO items (title, description, photo) VALUES ($1, $2, $3) RETURNING *';
    const values = [inventory_name, description || '', photo];
    
    const { rows } = await pool.query(query, values);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send('Database Error');
  }
});

/**
 * @openapi
 * /inventory:
 *   get:
 *     tags:
 *       - Inventory
 *     summary: Отримати список всіх елементів інвентарю
 *     responses:
 *       '200':
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Item'
 *       '500':
 *         description: Server error
 */
app.get('/inventory', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM items');
    const list = rows.map((item) => ({
      ...item,
      photoUrl: item.photo
        ? `http://localhost:${options.port}/inventory/${item.id}/photo`
        : null
    }));
    res.status(200).json(list);
  } catch (err) {
    console.error(err);
    res.status(500).send('Database Error');
  }
});

/**
 * @openapi
 * /inventory/{id}:
 *   get:
 *     tags:
 *       - Inventory
 *     summary: Отримати деталі елементу по id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       '200':
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Item'
 *       '404':
 *         description: Not found
 */
app.get('/inventory/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM items WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).send('Not found');

    const item = rows[0];
    res.status(200).json({
      ...item,
      photoUrl: item.photo
        ? `http://localhost:${options.port}/inventory/${item.id}/photo`
        : null
    });
  } catch (err) {
    res.status(500).send('Database Error');
  }
});

/**
 * @openapi
 * /inventory/{id}:
 *   put:
 *     tags:
 *       - Inventory
 *     summary: Оновити заголовок або опис елементу
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       '200':
 *         description: Updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Item'
 *       '404':
 *         description: Not found
 */
app.put('/inventory/:id', async (req, res) => {
  const { inventory_name, description } = req.body;
  try {
    const query = `
      UPDATE items 
      SET title = COALESCE($1, title), 
          description = COALESCE($2, description) 
      WHERE id = $3 
      RETURNING *`;
    const { rows } = await pool.query(query, [inventory_name, description, req.params.id]);
    
    if (rows.length === 0) return res.status(404).send('Not found');
    res.status(200).json(rows[0]);
  } catch (err) {
    res.status(500).send('Database Error');
  }
});

/**
 * @openapi
 * /inventory/{id}:
 *   delete:
 *     tags:
 *       - Inventory
 *     summary: Видалити елемент інвентарю
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       '200':
 *         description: Deleted successfully
 *       '404':
 *         description: Not found
 */
app.delete('/inventory/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT photo FROM items WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).send('Not found');

    const photo = rows[0].photo;
    if (photo) {
      const photoPath = path.join(cacheDir, photo);
      if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
    }

    await pool.query('DELETE FROM items WHERE id = $1', [req.params.id]);
    res.status(200).send('Deleted successfully');
  } catch (err) {
    res.status(500).send('Database Error');
  }
});

/**
 * @openapi
 * /inventory/{id}/photo:
 *   get:
 *     tags:
 *       - Inventory
 *     summary: Отримати фото елементу
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       '200':
 *         description: JPEG image
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       '404':
 *         description: Not found
 */
app.get('/inventory/:id/photo', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT photo FROM items WHERE id = $1', [req.params.id]);
    if (rows.length === 0 || !rows[0].photo) return res.status(404).send('Not found');

    const photoPath = path.join(cacheDir, rows[0].photo);
    if (!fs.existsSync(photoPath)) return res.status(404).send('File not found');

    res.setHeader('Content-Type', 'image/jpeg');
    res.sendFile(photoPath);
  } catch (err) {
    res.status(500).send('Database Error');
  }
});

/**
 * @openapi
 * /inventory/{id}/photo:
 *   put:
 *     tags:
 *       - Inventory
 *     summary: Завантажити або оновити фото для елементу
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       '200':
 *         description: Photo updated
 *       '400':
 *         description: Bad Request
 *       '404':
 *         description: Not found
 */
app.put('/inventory/:id/photo', upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).send('Bad Request: photo is required');

  try {
    const { rows } = await pool.query('SELECT photo FROM items WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).send('Not found');

    const oldPhoto = rows[0].photo;
    if (oldPhoto) {
      const oldPath = path.join(cacheDir, oldPhoto);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    await pool.query('UPDATE items SET photo = $1 WHERE id = $2', [req.file.filename, req.params.id]);
    res.status(200).send('Photo updated');
  } catch (err) {
    res.status(500).send('Database Error');
  }
});

/**
 * @openapi
 * /search:
 *   post:
 *     tags:
 *       - Inventory
 *     summary: Пошук елементу за id з опцією отримати посилання на фото
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *               has_photo:
 *                 type: string
 *                 description: '"on" to include photo URL in description'
 *     responses:
 *       '200':
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Item'
 *       '404':
 *         description: Not found
 */
app.post('/search', async (req, res) => {
  const { id, has_photo } = req.body;
  try {
    const { rows } = await pool.query('SELECT * FROM items WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).send('Not found');

    const item = rows[0];
    const responseData = { ...item };
    if (has_photo === 'on' && item.photo) {
      responseData.description += ` (Photo URL: http://localhost:${options.port}/inventory/${item.id}/photo)`;
    }

    res.status(200).json(responseData);
  } catch (err) {
    res.status(500).send('Database Error');
  }
});

app.all(['/register', '/inventory', '/inventory/:id', '/inventory/:id/photo', '/search'], (req, res) => {
  res.status(405).send('Method not allowed');
});

const server = http.createServer(app);
server.listen(options.port, options.host, () => {
  console.log(`Server is running at http://localhost:${options.port}`);
  console.log(`Swagger: http://localhost:${options.port}/docs`);
});