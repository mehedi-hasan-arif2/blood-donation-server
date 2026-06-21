const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).send({ message: 'Unauthorized access' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).send({ message: 'Unauthorized access' });
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    req.decoded = decoded;
    next();

  } catch (error) {
    return res.status(401).send({ message: 'Unauthorized access' });
  }
};

module.exports = verifyToken;