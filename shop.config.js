/* Instellingen van het restaurant. Pas hier aan, dan verandert de site en de bestel-server mee.
   pickup.payment: "whatsapp" = afhalen bestellen via WhatsApp, betalen bij ophalen
                   "online"   = afhalen bestellen en betalen op de site via Buckaroo
   whatsapp: nummer in internationaal formaat zonder + of spaties, bv. 31612345678
   delivery.mode: "thuisbezorgd" = bezorgen via Thuisbezorgd, "own" = bezorgen via deze site */
window.SHOP={
 "name": "Eetcafé & Lunchroom Chef",
 "address": "Leyweg 920 D, 2545 GV Den Haag",
 "phone": "",
 "whatsapp": "",
 "api": "/api/",
 "hours": {
  "0": [
   "12:00",
   "19:30"
  ],
  "1": [
   "12:00",
   "19:30"
  ],
  "2": null,
  "3": [
   "12:00",
   "19:30"
  ],
  "4": [
   "12:00",
   "19:30"
  ],
  "5": [
   "12:00",
   "19:30"
  ],
  "6": [
   "12:00",
   "19:30"
  ]
 },
 "pickup": {
  "enabled": true,
  "payment": "whatsapp",
  "prepMinutes": 20,
  "slotMinutes": 15
 },
 "delivery": {
  "enabled": true,
  "mode": "thuisbezorgd",
  "thuisbezorgdUrl": "https://www.thuisbezorgd.nl/menu/eethuis-lunchroom-chef",
  "prepMinutes": 45,
  "minOrder": 15,
  "fee": 2.5,
  "postcodes": []
 }
};
