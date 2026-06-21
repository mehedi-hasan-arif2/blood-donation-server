const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

// Middlewares
const verifyToken = require('./middlewares/verifyToken');
const verifyAdmin = require('./middlewares/verifyAdmin');
const verifyVolunteer = require('./middlewares/verifyVolunteer');

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGO_URI, { serverApi: { version: ServerApiVersion.v1 } });

async function run() {
  await client.connect();
  const db = client.db("bloodDonationDB");
  const usersCollection = db.collection("users");

  // JWT & Auth 
  app.post('/jwt', async (req, res) => {
    const token = jwt.sign(req.body, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
    res.send({ token });
  });

  // Admin/Volunteer Role Verification Routes 
  app.get('/users/admin/:email', verifyToken, async (req, res) => {
    const user = await usersCollection.findOne({ email: req.params.email });
    res.send({ admin: user?.role === 'admin' });
  });

  app.get('/users/volunteer/:email', verifyToken, async (req, res) => {
    const user = await usersCollection.findOne({ email: req.params.email });
    res.send({ volunteer: user?.role === 'volunteer' });
  });
}
run();
app.listen(5000);