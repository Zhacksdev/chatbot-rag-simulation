const { listProducts, SHOP } = require("../lib/answer");

module.exports = (req, res) => {
  res.status(200).json({ shop: SHOP, products: listProducts() });
};
