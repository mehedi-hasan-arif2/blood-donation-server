const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

const port = process.env.PORT || 5000;

const verifyToken = require('./middlewares/verifyToken');
const verifyAdmin = require('./middlewares/verifyAdmin');
const verifyVolunteer = require('./middlewares/verifyVolunteer');

app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

async function run() {
  try {
    await client.connect();

    const db = client.db("bloodDonationDB");
    const usersCollection = db.collection("users");
    const donationRequestsCollection = db.collection("donationRequests");

    /* AUTH */
    app.post('/jwt', async (req, res) => {
      const token = jwt.sign(req.body, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    });

    /* REGISTER */
    app.post('/register', async (req, res) => {
      const existing = await usersCollection.findOne({ email: req.body.email });
      if (existing) return res.send({ message: 'User already exists' });

      const hashedPassword = await bcrypt.hash(req.body.password, 10);
      const newUser = { ...req.body, password: hashedPassword, role: 'donor', status: 'active' };
      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    /* USERS - PAGINATION */
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const users = await usersCollection.find().skip(skip).limit(limit).toArray();
      const total = await usersCollection.countDocuments();

      res.send({ users, total, page, totalPages: Math.ceil(total / limit) });
    });

    /* DONATION REQUESTS - FILTER + PAGINATION */
    app.get('/donation-requests', async (req, res) => {
      const { status, page = 1, limit = 10 } = req.query;
      const query = status ? { status } : {};
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const result = await donationRequestsCollection.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();
      
      const total = await donationRequestsCollection.countDocuments(query);

      res.send({
        data: result,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / limit)
      });
    });

    await client.db("admin").command({ ping: 1 });
    console.log("MongoDB connected successfully!");
  } catch (err) {
    console.error(err);
  }
}

run();

app.get('/', (req, res) => res.send('Blood Donation Server Running'));
app.listen(port, () => console.log(`Server running on port ${port}`));