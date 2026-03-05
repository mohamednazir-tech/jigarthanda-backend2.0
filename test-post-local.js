const fetch = require('node-fetch');

const testOrder = {
  userId: "usr_nazir_001",
  items: [
    {
      item: {
        id: "3",
        name: "Jigarthanda Mini",
        price: 60,
        category: "jigarthanda",
        nameLocal: "மினி ஜிகர்தண்டா"
      },
      quantity: 2
    }
  ],
  total: 120,
  tax: 0,
  grandTotal: 120,
  paymentMethod: "cash"
};

console.log('Testing POST /api/orders...');

fetch('http://localhost:3000/api/orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(testOrder)
})
.then(response => {
  console.log('Status:', response.status);
  return response.text();
})
.then(text => {
  console.log('Raw Response:', text);
  try {
    const json = JSON.parse(text);
    console.log('Parsed JSON:', json);
  } catch(e) {
    console.log('JSON Parse Error:', e.message);
  }
})
.catch(error => {
  console.error('Error:', error);
});
