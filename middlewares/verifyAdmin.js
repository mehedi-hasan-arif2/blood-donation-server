const { MongoClient } = require('mongodb');
const uri = process.env.MONGO_URI;

const verifyAdmin = async (req, res, next) => {
  const email = req.decoded.email;
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const user = await client.db("bloodDonationDB").collection("users").findOne({ email });
    if (user?.role !== 'admin') {
      return res.status(403).send({ message: 'forbidden access' });
    }
    next();
  } catch (error) {
    res.status(500).send({ message: 'Server Error' });
  } finally {
    await client.close(); 
  }
};

module.exports = verifyAdmin;