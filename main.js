const express = require('express');
const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const http = require('http');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

program
  .requiredOption('-H, --host <host>', 'адреса сервера')
  .requiredOption('-p, --port <port>', 'порт сервера')
  .requiredOption('-c, --cache <cache>', 'шлях до директорії кеша');

program.parse(process.argv);
const options = program.opts();

const cacheDir = path.resolve(options.cache);
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

const dbPath = path.join(cacheDir, 'inventory.json');
let inventoryDB = [];
if (fs.existsSync(dbPath)) {
  inventoryDB = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
}
const saveDB = () => fs.writeFileSync(dbPath, JSON.stringify(inventoryDB, null, 2));

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
      description: 'API для керування інвентарем (лабораторна робота)'
    },
    servers: [
      {
        url: `http://${options.host}:${options.port}`
      }
    ]
  },
  apis: [path.resolve(__filename)]
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @openapi
 * /RegisterForm.html:
 *   get:
 *     summary: Отримати HTML форму реєстрації
 *     tags: [Pages]
 *     responses:
 *       200:
 *         description: HTML сторінка
 */
app.get('/RegisterForm.html', (req, res) =>
  res.sendFile(path.join(__dirname, 'RegisterForm.html'))
);

/**
 * @openapi
 * /SearchForm.html:
 *   get:
 *     summary: Отримати HTML форму пошуку
 *     tags: [Pages]
 *     responses:
 *       200:
 *         description: HTML сторінка
 */
app.get('/SearchForm.html', (req, res) =>
  res.sendFile(path.join(__dirname, 'SearchForm.html'))
);

/**
 * @openapi
 * /register:
 *   post:
 *     summary: Реєстрація нового предмета
 *     tags: [Actions]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [inventory_name]
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Предмет успішно створено
 *       400:
 *         description: Відсутній inventory_name
 *   x-other-methods:
 *     405:
 *       description: Method not allowed
 */
app.post('/register', upload.single('photo'), (req, res) => {
  const { inventory_name, description } = req.body;
  if (!inventory_name) {
    return res.status(400).send('Bad Request: inventory_name is required');
  }

  const newItem = {
    id: Date.now().toString(),
    inventory_name,
    description: description || '',
    photo: req.file ? req.file.filename : null
  };

  inventoryDB.push(newItem);
  saveDB();
  res.status(201).json(newItem);
});
app.all('/register', (req, res) => res.status(405).send('Method not allowed'));

/**
 * @openapi
 * /inventory:
 *   get:
 *     summary: Отримати весь список інвентарю
 *     tags: [Inventory]
 *     responses:
 *       200:
 *         description: Масив об'єктів інвентарю
 *   x-other-methods:
 *     405:
 *       description: Method not allowed
 */
app.get('/inventory', (req, res) => {
  const list = inventoryDB.map((item) => ({
    ...item,
    photoUrl: item.photo
      ? `http://${options.host}:${options.port}/inventory/${item.id}/photo`
      : null
  }));
  res.status(200).json(list);
});
app.all('/inventory', (req, res) => res.status(405).send('Method not allowed'));

/**
 * @openapi
 * /inventory/{id}:
 *   get:
 *     summary: Отримати предмет за ID
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Предмет знайдено
 *       404:
 *         description: Не знайдено
 *   put:
 *     summary: Оновити дані предмета
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
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
 *       200:
 *         description: Оновлено
 *       404:
 *         description: Не знайдено
 *   delete:
 *     summary: Видалити предмет
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Видалено
 *       404:
 *         description: Не знайдено
 *   x-other-methods:
 *     405:
 *       description: Method not allowed
 */
app.get('/inventory/:id', (req, res) => {
  const item = inventoryDB.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).send('Not found');

  res.status(200).json({
    ...item,
    photoUrl: item.photo
      ? `http://${options.host}:${options.port}/inventory/${item.id}/photo`
      : null
  });
});

app.put('/inventory/:id', (req, res) => {
  const itemIndex = inventoryDB.findIndex((i) => i.id === req.params.id);
  if (itemIndex === -1) return res.status(404).send('Not found');

  const { inventory_name, description } = req.body;
  if (inventory_name) inventoryDB[itemIndex].inventory_name = inventory_name;
  if (description !== undefined) inventoryDB[itemIndex].description = description;

  saveDB();
  res.status(200).json(inventoryDB[itemIndex]);
});

app.delete('/inventory/:id', (req, res) => {
  const itemIndex = inventoryDB.findIndex((i) => i.id === req.params.id);
  if (itemIndex === -1) return res.status(404).send('Not found');

  const item = inventoryDB[itemIndex];
  if (item.photo) {
    const photoPath = path.join(cacheDir, item.photo);
    if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
  }

  inventoryDB.splice(itemIndex, 1);
  saveDB();
  res.status(200).send('Deleted successfully');
});
app.all('/inventory/:id', (req, res) => res.status(405).send('Method not allowed'));

/**
 * @openapi
 * /inventory/{id}/photo:
 *   get:
 *     summary: Отримати фото предмета
 *     tags: [Media]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: JPEG image
 *       404:
 *         description: Не знайдено
 *   put:
 *     summary: Оновити фото предмета
 *     tags: [Media]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [photo]
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Фото оновлено
 *       400:
 *         description: Фото не передано
 *       404:
 *         description: Не знайдено
 *   x-other-methods:
 *     405:
 *       description: Method not allowed
 */
app.get('/inventory/:id/photo', (req, res) => {
  const item = inventoryDB.find((i) => i.id === req.params.id);
  if (!item || !item.photo) return res.status(404).send('Not found');

  const photoPath = path.join(cacheDir, item.photo);
  if (!fs.existsSync(photoPath)) return res.status(404).send('Not found');

  res.setHeader('Content-Type', 'image/jpeg');
  res.sendFile(photoPath, { dotfiles: 'allow' });
});

app.put('/inventory/:id/photo', upload.single('photo'), (req, res) => {
  const itemIndex = inventoryDB.findIndex((i) => i.id === req.params.id);
  if (itemIndex === -1) return res.status(404).send('Not found');
  if (!req.file) return res.status(400).send('Bad Request: photo is required');

  const oldPhoto = inventoryDB[itemIndex].photo;
  if (oldPhoto) {
    const oldPath = path.join(cacheDir, oldPhoto);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  inventoryDB[itemIndex].photo = req.file.filename;
  saveDB();
  res.status(200).send('Photo updated');
});
app.all('/inventory/:id/photo', (req, res) =>
  res.status(405).send('Method not allowed')
);

/**
 * @openapi
 * /search:
 *   post:
 *     summary: Пошук предмета
 *     tags: [Actions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required: [id]
 *             properties:
 *               id:
 *                 type: string
 *               has_photo:
 *                 type: string
 *                 description: Передайте значення on, щоб додати URL фото в опис
 *     responses:
 *       200:
 *         description: Предмет знайдено
 *       404:
 *         description: Не знайдено
 *   x-other-methods:
 *     405:
 *       description: Method not allowed
 */
app.post('/search', (req, res) => {
  const { id, has_photo } = req.body;
  const item = inventoryDB.find((i) => i.id === id);
  if (!item) return res.status(404).send('Not found');

  const responseData = { ...item };
  if (has_photo === 'on' && item.photo) {
    responseData.description += ` (Photo URL: http://${options.host}:${options.port}/inventory/${item.id}/photo)`;
  }

  res.status(200).json(responseData);
});
app.all('/search', (req, res) => res.status(405).send('Method not allowed'));

const server = http.createServer(app);
server.listen(options.port, options.host, () => {
  console.log(`Server is running at http://${options.host}:${options.port}`);
  console.log(`Cache directory: ${cacheDir}`);
  console.log(`Swagger: http://${options.host}:${options.port}/docs`);
});
