const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const port = process.env.PORT || 5000;

// middlewares
app.use(cors());
app.use(express.json());

// database uri from env
const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();

    // collections
    const usersCollection = client.db("bloodDonationDB").collection("users");

    // USER REGISTRATION API
    app.post('/register', async (req, res) => {
      const userData = req.body;

      // check if user already exists
      const query = { email: userData.email };
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: 'User already exists', insertedId: null });
      }

      // set default values
      const newUser = {
        ...userData,
        role: 'donor',
        status: 'active'
      };

      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    // verify connection
    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB successfully!");
  } catch (error) {
    console.error("DB connection error:", error);
  }
}
run();

// root api
app.get('/', (req, res) => {
  res.send('Blood Donation Server is running');
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});