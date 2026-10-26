/* chat-engine.js — the Bouesti Assistant's brain, shared by the server (chatbot.js) and the browser (care.js).
 *
 * It runs in two places so the assistant works everywhere:
 *   • server mode   : facts come from the live database (chatbot.js feeds them in)
 *   • offline / demo: facts come from the products already loaded in the page (or knowledge-data.js)
 *
 * Teaching it something new:
 *   POLICY         — the rules and facts of the site (fees, delivery, claims…)
 *   GUIDES         — step-by-step "how do I…" answers (track an order, sign up, claim, sell…)
 *   PRODUCT_NOTES  — what each product is for, how to store it, what to look out for
 *   LIVESTOCK_NOTES— breed / animal knowledge
 *   TOPICS         — which words trigger which guide (the matching table)
 * Prices, stock, weights, states and delivery fees are never typed here — they always come from `facts`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMChatEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // measurement techniques (kg, derica, bunch, crate ...): the same registry the shop uses
  var Units = (typeof module === 'object' && module.exports) ? require('./units.js') : ((typeof self !== 'undefined' && self.BMUnits) || {
    name: function (u) { return String(u || ''); }, fmt: function (n) { return String(n); }, qtyText: function (q, u) { return q + ' ' + u; },
    priceFor: function (p, q) { return Number(q) === 1 ? Math.round(p) : Math.round(p * q / 10) * 10; }, unitFromWord: function () { return null; }, aliasPattern: function () { return 'kg'; }
  });

  var CATEGORIES = [
    ['not_delivered', 'Order not delivered'], ['late_delivery', 'Late delivery'], ['wrong_item', 'Wrong item, weight or breed'],
    ['poor_quality', 'Poor quality / spoiled produce'], ['livestock_issue', 'Livestock problem'], ['wrong_charge', 'Wrong charge / refund'],
    ['payment', 'Payment problem'], ['account', 'Account or login'], ['website', 'Website problem'], ['other', 'Something else']
  ];

  var SUB_LABELS = {
    tubers: 'Tubers and root crops', grains: 'Grains and cereals', legumes: 'Legumes, beans and oilseeds', fruits: 'Fruits and nuts',
    vegetables: 'Vegetables', spices: 'Spices, herbs and traditional seasonings', processed: 'Processed agricultural produce',
    livestock: 'Livestock and animal products', poultry: 'Poultry products', fish: 'Fish and aquaculture products'
  };
  var CATEGORY_ORDER = ['tubers', 'grains', 'legumes', 'fruits', 'vegetables', 'spices', 'processed', 'livestock', 'poultry', 'fish'];

  // ======================================================================
  // POLICY — facts and rules of the website
  // ======================================================================
  var POLICY = {
    about:
      'Bouesti Marketplace is an online farm marketplace that grew out of Ekiti State, Nigeria. It connects buyers directly with verified Ekiti farmers and livestock breeders for a wide range of farm produce, livestock, poultry and fish, delivered to your door.',
    categories:
      'Everything is organised into 10 categories. Farm produce: Tubers and root crops; Grains and cereals; Legumes, beans and oilseeds; Fruits and nuts; Vegetables; Spices, herbs and traditional seasonings; Processed agricultural produce. Livestock section: Livestock and animal products; Poultry products; Fish and aquaculture products. On the homepage use the filter buttons above each section to jump to a category, or the search box (it also searches category names).',
    sections:
      'The homepage has these sections: Announcements (news from the Bouesti team), Produce (7 categories), Livestock, poultry and fish (3 categories), How it works, Sell (for farmers), Delivery (states and fees), Insurance & buyer protection, and Support (this chat, complaints and contact). The top menu also has search, the dark/light theme button, your account button and the Cart.',
    delivery:
      'We deliver in all 16 Ekiti State LGAs and in Osun, Ondo, Kwara, Kogi, Edo and Ogun. You choose your state at checkout and the exact delivery fee is shown before you pay. The fee is per order, not per item. Outside Ekiti you type your town or LGA. If your state is not on the list, we do not deliver there yet.',
    deliveryTime:
      'Ekiti orders are usually delivered within about 24 hours. Other states take a little longer depending on the route. You pick a delivery date at checkout and we confirm it on the confirmation call.',
    lgas:
      'Ekiti State LGAs we deliver to: Ado-Ekiti, Efon, Ekiti East, Ekiti South-West, Ekiti West, Emure, Gbonyin, Ido-Osi, Ijero, Ikere, Ikole, Ilejemeje, Irepodun/Ifelodun, Ise/Orun, Moba and Oye.',
    fees:
      'Three amounts make up an order: the goods, a service fee of 5% of the goods (paid by the buyer, never by the farmer), and a delivery fee for your state (per order). You always see the full total at checkout before you place the order.',
    payment:
      'At checkout choose Pay on delivery, Bank transfer, or card through Paystack (when online payment is switched on). Pay only through the options shown at checkout, never to a personal account someone sends you in a message.',
    protection:
      'Buyer Protection covers every order: (1) Full-refund promise: if your order is not delivered, or what arrives does not match the listing, you get a full refund. (2) Livestock health certificate: every livestock listing needs an up-to-date vet health certificate, which you can download with your order confirmation. (3) 24-hour claims desk: report any problem within 24 hours of delivery and the team coordinates with the farmer for you.',
    covered:
      'Covered: order not delivered or cancelled by us after you paid; not as described (wrong item, weight, pack size, breed or type, live instead of processed); poor quality on arrival (spoiled or rotten produce, mostly broken eggs); livestock that arrive sick or injured or do not match their health certificate; being charged more than the checkout total.',
    notCovered:
      'Not covered: reports made more than 24 hours after delivery; damage or spoilage after delivery caused by storage or handling; normal natural variation in size or shape of farm produce; orders that could not be delivered because the address was wrong or the phone could not be reached.',
    account:
      'Create an account from Login / Sign up: first name, last name, email, phone number and a password of at least 6 characters. One email can only be used for one account. Your orders, receipts and tracking live in your account.',
    password:
      'Forgot your password? On the login page tap "Forgot password?" and enter your email or phone number. We send a 4-digit code; enter it, then choose a new password.',
    twoFa:
      'Two-factor authentication (2FA) can be switched on from the security settings of your account dashboard.',
    sell:
      'Farmers list for free: ₦0 to list, no monthly fee, and you keep 100% of the price you set (the 5% service fee and delivery are paid by the buyer). Every seller is checked before listing; livestock needs an up-to-date vet health certificate (breed, age and weight range). We list your items with pictures and weights, confirm orders, arrange delivery with GPS tracking and agree a payment schedule once you are verified.',
    sellDocs:
      'To be listed you need: your name and phone number, what you grow or rear, how much you can supply, your price per unit or kg, and your location. Livestock sellers also need an up-to-date vet health certificate (breed, age, weight range). There is no listing fee. Every seller is checked before going live.',
    hours:
      'The customer desk is open Monday to Saturday, 7am–7pm (West Africa Time), based in Ado-Ekiti. Messages sent outside those hours are answered by 8am the next morning.',
    receipts:
      'After placing an order you can View or Print the receipt from the confirmation window, and later from My Orders. A receipt shows the order reference, items, goods total, service fee, delivery fee and the grand total.',
    cancel:
      'There is no self-service cancel button. To change or cancel an order, tell us as early as possible with your order reference, because it can only be changed before it is packed and dispatched.',
    bulk:
      'Larger quantities are welcome. Add the quantity you want to the cart (or the weight option for kg items), and for very large or regular bulk orders tell the desk what you need and where it should go so they can confirm availability and delivery.',
    quality:
      'Produce comes from verified Ekiti farms and livestock is vet-checked before it is listed. Short routes keep goods fresh and animals less stressed.',
    complaints:
      'You can log a complaint any time: tell me what happened and I will open the form for you, or use the Log a complaint form in the Support section. You get a reference like CC-20261008-1234. Keep it: enter it with your phone number or email under "Track a complaint" in the Support section to see the team\'s replies and add messages.',
    insurance:
      'The "Insurance" section on the homepage is about buyer protection: the full-refund promise, the livestock health certificate and the 24-hour claims desk. It is not a paid insurance product; protection comes with every order at no extra cost.',
    priceRules:
      'Every product is priced per the unit that suits it, shown on the card: per kg, derica, mudù, paint rubber, bowl, heap, bunch, hand, tuber, cob, head, bird, crate, tray, dozen, litre and so on. Many items can be bought in several ways (for example a derica, a paint rubber or a 50 kg bag of beans, or a bunch, a bundle): open the product and choose from "How do you want to buy it?" — each way shows its price. Live broilers and pigs are priced per kg; broilers can also be bought processed (dressed) at a higher per-kg price.',
    stock:
      'The stock number on a card is what is available now. Low-stock items sell out fast; an out-of-stock item cannot be added to the cart until it is restocked.',
    theme:
      'Use the moon/sun button in the top menu to switch between dark and light mode. Your choice is remembered.',
    notifications:
      'Announcements from the Bouesti team (prices, delivery changes, offers) appear in the Announcements section on the homepage.'
  };

  // ======================================================================
  // GUIDES — step by step help. {track} etc. are filled with live facts.
  // ======================================================================
  var GUIDES = {
    track:
      'Here is how to track your order, step by step:\n' +
      '1. Log in with the same account you ordered with (Login / Sign up, top right).\n' +
      '2. Open **My Orders** from your account area, or go straight to the Track order page (track.html).\n' +
      '3. Pick your order from the list. If you came from the order confirmation, it is already selected. Your order reference looks like BM-20261006-1234 (or BST-ABC123 in demo mode).\n' +
      '4. You will see its status: Pending (received), Processing (being prepared / on the road) or Delivered. When the rider is travelling you also see their position on the map, and it refreshes by itself every few seconds.\n' +
      '5. Need the paperwork? Tap the receipt link on the same page.\n' +
      'If the map says "waiting for the rider", the order has not left yet; that is normal until it is dispatched. If the page cannot log you in, check that you are using the email (or phone) you registered with. Tell me what you see and I will help.',
    order:
      'Here is how to place an order:\n' +
      '1. Browse **Produce** or **Livestock**, or use the search box at the top. The category buttons narrow the list. Tap a picture or name to open the zoomable detail window.\n' +
      '2. Choose the option you want (weight or pack size, live or processed for broilers) and tap **Add to cart**. Use + and − for quantity.\n' +
      '3. Open the **Cart** (top right) and tap Checkout. If you are not logged in you will be asked to log in or sign up first.\n' +
      '4. Enter your name and phone, choose your state (Ekiti: pick your LGA; other states: type your town), your address, a delivery date and how you want to pay.\n' +
      '5. Check the total (goods + 5% service fee + delivery fee) and place the order. You get an order reference and can print the receipt.\n' +
      '6. We call to confirm, pack and deliver. Follow it under Track order.',
    signup:
      'To create an account:\n' +
      '1. Tap **Login / Sign up** at the top right, then the Sign up tab.\n' +
      '2. Enter first name, last name, email, phone number and a password (at least 6 characters).\n' +
      '3. Tap Create account. You are signed in straight away and sent back to where you were.\n' +
      'One email can only be used once. Already have an account? Use the Log in tab.',
    login:
      'To log in: tap **Login / Sign up**, enter the email and password you registered with, and tap Log in. If it says incorrect email or password, check for typing mistakes, or use "Forgot password?" to reset it. If you have never signed up on this device or server, create an account first.',
    forgot:
      'To reset your password:\n1. On the login page tap **Forgot password?**\n2. Enter your email or phone number.\n3. Enter the 4-digit code we send.\n4. Choose a new password and log in with it.',
    claim:
      'To make a claim or report a problem:\n' +
      '1. Do it within **24 hours of delivery**. Check goods while the rider is with you.\n' +
      '2. Tell me what happened (or tap Log a complaint) and fill in your name, phone or email, order reference and what was wrong.\n' +
      '3. Take clear photos or a short video of the problem; they speed up the decision.\n' +
      '4. You get a complaint reference (CC-…). Use "Track a complaint" in the Support section with it and your phone or email to read the team\'s reply.\n' +
      '5. The team checks with the farmer. If approved you get a replacement or a full refund, depending on the case and stock.',
    sell:
      'To start selling on Bouesti:\n1. Open the Sell page (sell.html) or the Sell section on the homepage and send your details: what you grow or rear, quantity, your price per unit or kg, and your location.\n2. For livestock, have a current vet health certificate ready (breed, age, weight range).\n3. The team verifies you and lists your items with pictures and weights.\n4. Orders come in, we arrange delivery with GPS tracking, and you keep 100% of your price. Listing is free.',
    search:
      'To find a product quickly: type its name in the search box at the top (for example "yam" or "tomato"), or use the Produce / Livestock sections and their category buttons. Tap any card for the larger picture, description and options.',
    cart:
      'The Cart is at the top right. Add items with the Add to cart button; inside the cart you can change quantities or remove items and see the subtotal. Tap Checkout when ready; the final total with service fee and delivery fee is shown before you confirm.',
    myorders:
      'My Orders lists the orders you have placed with your account. From there you can open the receipt and go to Track order. It appears in your account area once you are logged in.',
    receipt:
      'To get your receipt: after ordering, tap View receipt or Print receipt in the confirmation window. Later, open My Orders and choose the order. The receipt page has a Print button (you can also save it as a PDF from the print dialog).',
    contact:
      'You can reach the Bouesti desk through the Support section of the website (this chat or the complaint form), by email or by WhatsApp, Monday to Saturday 7am–7pm. For anything about an order, the fastest self-service route is to ask me or log a complaint with your order reference, so it is recorded.'
  };

  // ======================================================================
  // PRODUCT KNOWLEDGE — keyed by a word in the product name
  // ======================================================================
  var PRODUCT_NOTES = {
    rodo: 'Very hot, fruity scotch bonnet. Used for pepper soup, stews, ata din din and suya spice. Keep in the fridge up to about 2 weeks or blend and freeze in portions.',
    tatashe: 'Large, mild red bell pepper that gives stews and jollof their deep red colour. Roast or boil with rodo and tomatoes for the base. Fridge: about 1–2 weeks.',
    shombo: 'Long cayenne-type pepper, medium hot. Good fresh in stews and sauces or dried and ground. Dries well in the sun.',
    wewe: 'Small, very hot chilli (bird pepper type). Use sparingly in soups, pepper sauce and kunun spice. Freezes well.',
    cameroon: 'Dried, smoky, very hot Ijosi pepper used for pepper soup and local stews. Store in an airtight jar away from damp.',
    pepper: 'Mixed fresh pepper (Tatashe and Rodo blend), sorted and ready for stew base. Best used within a week, or blend and freeze.',
    tomato: 'Fresh, firm tomatoes for stews, jollof and salads. Ripe ones last 3–5 days at room temperature; the fridge extends it. Pair with tatashe and onions for the stew base.',
    cucumber: 'Crisp, great fresh, in salads or juiced. Keep chilled and use within about a week.',
    carrot: 'Sweet, crunchy carrots for fried rice, salads, soups and juice. Remove the green tops and keep in the fridge for 2–3 weeks.',
    cabbage: 'Firm green cabbage for salads, stir-fry, coleslaw and stews. Keeps 1–2 weeks in the fridge.',
    lettuce: 'Crisp lettuce for salads and burgers. Wash and keep chilled; best within 3–5 days.',
    spinach: 'Tender green spinach for efo riro, smoothies and omelettes. Cook lightly; use within 2–3 days.',
    okra: 'Young tender pods for draw soup, okro stew and fried okra. Choose pods that snap; keep dry in the fridge for about 5 days.',
    maize: 'Fresh sweet corn on the cob: boil or roast it. Best eaten within 1–2 days of harvest, or keep in the husk in the fridge.',
    garden: 'Garden egg (African eggplant) eaten raw with groundnut or cooked in sauces and stews. Keeps about a week in a cool place.',
    onion: 'Firm, well-cured onions for every kitchen use. Store in a cool, dry, airy place for several weeks.',
    ginger: 'Fresh ginger for tea, stews, smoothies and spice mixes. Keeps for weeks in the fridge; freeze grated for months.',
    turmeric: 'Fresh turmeric roots for cooking, tea and wellness drinks. Keep in the fridge, or slice and dry.',
    ugu: 'Fluted pumpkin leaves, the star of efo riro, egusi and vegetable soup. Wash and slice; use within 2–3 days or blanch and freeze.',
    ewedu: 'Jute leaves for slippery ewedu soup, usually eaten with amala and gbegiri. Cook fresh within 1–2 days.',
    waterleaf: 'Juicy waterleaf for edikang ikong, afang and everyday soups. Cook within 2 days; it releases a lot of water.',
    bitter: 'Washed bitter leaf for ofe onugbu and soups. Squeeze out the bitterness while washing; use within 2–3 days.',
    scent: 'Aromatic efirin used in pepper soup, stews and rice dishes. Use fresh within a few days or dry.',
    tete: 'Efo tete (green amaranth), a Yoruba soup staple. Cook within 2 days.',
    shoko: 'Efo shoko (celosia) cooked in stew or with palm oil. Soft, mild leaves; use within 2–3 days.',
    beans: 'Fresh green beans for stir-fry, rice and stews. Keep dry in the fridge for about a week.',
    pumpkin: 'Farm pumpkin for soup, porridge and stews. Whole pumpkins keep for weeks in a cool place.',
    yam: 'White yam tubers for boiling, frying, pounded yam and porridge. Store in a cool, ventilated place for weeks, never in plastic.',
    water: 'Water yam (ewura) cooks soft and is used for porridge and pounded dishes. Use sooner than white yam.',
    cocoyam: 'Cocoyam (taro) for soups and porridge. It thickens soups. Store cool and dry.',
    potato: 'Sweet potatoes for boiling, frying, porridge and chips. Store in a cool, dark, dry place.',
    irish: 'Irish potatoes for chips, porridge, salads and stews. Keep in the dark and cool so they do not turn green.',
    cassava: 'Fresh cassava roots for garri, fufu and lafun. Use within 2–3 days of harvest because they spoil quickly.',
    tiger: 'Tiger nuts for snacking and making kunun aya. Soak and blend for the drink; keep dry for months.',
    ofada: 'Local unpolished ofada rice with a distinct aroma, famous with ofada stew. Pick out small stones and wash well before cooking.',
    rice: 'Clean local long-grain parboiled rice for jollof, fried rice and everyday meals. Wash well before cooking.',
    garri: 'Garri (cassava granules) for eba or soaking with groundnuts and milk. White garri is sour and fine; yellow garri has palm oil. Keep sealed and dry.',
    lafun: 'Cassava flour (lafun) for the soft, stretchy amala-style swallow. Keep sealed and dry.',
    fufu: 'Fine fufu flour for smooth swallow. Keep sealed and dry.',
    eggs: 'Farm-fresh eggs sold by the crate of 30. Keep cool and use within a few weeks; to test freshness, a fresh egg sinks in water.',
    broiler: 'Vet-cleared broilers sold by weight, live or dressed (processed). Live is cheaper per kg; processed saves the work of cleaning.',
    chicks: 'Eight-week-old vaccinated broiler chicks, sold per bird, for finishing to table weight. Keep warm, dry and with clean water.',
    pork: 'Fresh dressed pork sold by the kilo. Keep refrigerated and cook within 2 days, or freeze.',
    pig: 'Pigs are sold live; the weight option sets the size you get. Livestock orders come with a vet health certificate.',
    weaner: 'Weaner pigs are young pigs just taken off the sow, sold per head for rearing. Keep warm, dry and vaccinated.'
  };

  var LIVESTOCK_NOTES = {
    duroc: 'Duroc: a red-brown breed known for fast growth and good meat quality, hardy in the local climate. A favourite for rearing and pork.',
    landrace: 'Landrace: long, white pig with drooping ears. A good mother and a lean, fast-growing meat breed.',
    largewhite: 'Large White: a white pig with upright ears, fast growing and widely reared for pork and breeding.',
    fulani: 'White Fulani (Bunaji): a white zebu-type cow with a hump and lyre horns, hardy and common in Nigerian markets; used for beef and milk.',
    gudali: 'Sokoto Gudali: a large, heavy, short-horned zebu breed, good beef animal and strong draught animal.',
    bororo: 'Red Bororo (Rahaji): a red-brown, long-horned zebu breed, prized for its size and hardiness.',
    health:
      'Every livestock listing needs an up-to-date vet health certificate, which comes with your order confirmation. When the animal arrives, check it looks alert and steady, then tell the rider about any problem straight away; report issues within 24 hours.',
    arrival:
      'When livestock arrive: give clean water first, a quiet shaded space, then feed after they settle. Keep newly arrived animals separate from others for a few days and keep the health certificate safe.',
    live:
      'Live animals are priced by weight (kg) or per head depending on the item. Pick the weight option on the card, and the price adjusts. Broilers can be bought live or processed; processed costs more per kg because it is cleaned and dressed.'
  };

  /*ITEM_TIPS_START*/ var ITEM_TIPS = {
  "p-beetroot": "Cut the leaves off, leave 2 cm of stem, and keep chilled for up to 3 weeks. Boil whole before peeling to keep the colour.",
  "p-radish": "Best fresh in salads. Keep in the fridge and use within a week.",
  "p-turnip": "Peel before cooking; keeps 2 weeks in a cool place.",
  "p-potato-orange": "Boil, roast or fry. Store cool, dark and dry; never in the fridge.",
  "p-potato-purple": "Steam or roast to keep the colour. Store cool and dark.",
  "p-yam-puna": "Great for pounded yam and boiling. Keep in a ventilated, shaded place.",
  "p-yam-bean": "Peel and eat raw in salads or with pepper. Keep chilled up to 2 weeks.",
  "p-cassava-sweet": "Cook within 2–3 days of purchase because cassava spoils fast.",
  "p-yam-aerial": "Peel, boil well and eat with stew or oil. Use within a week.",
  "p-maize-white": "Keep sealed and dry; milled maize makes ogi (pap) and tuwo.",
  "p-maize-yellow": "Store in a dry, airy bag away from damp.",
  "p-popcorn": "Heat in a covered pot with a little oil; keep kernels sealed so they stay poppable.",
  "p-sorghum-red": "Wash, soak and mill for kunu or pap. Keep dry.",
  "p-sorghum-white": "Pound or mill for tuwo. Keep dry and sealed.",
  "p-millet": "Wash well, then use for fura or tuwo. Store dry.",
  "p-acha": "Steam like couscous in 10 minutes or cook as porridge. Rinse to remove grit.",
  "p-rice-brown": "Needs more water and about 40 minutes to cook. Keep sealed.",
  "p-rice-bag": "Store raised off the floor in a dry room.",
  "p-wheat": "Mill into flour or boil whole for porridge. Keep dry.",
  "p-oats": "Cook with milk or water for 5–10 minutes. Keep sealed.",
  "p-beans-brown": "Pick out stones, soak, then boil. Keeps a year when dry and sealed.",
  "p-beans-white": "Soak and peel for smooth akara and moi moi.",
  "p-soybeans": "Boil thoroughly; never eat raw. Great for soy milk and daddawa.",
  "p-groundnut-shelled": "Roast, boil or grind. Store cool and dry to prevent mould.",
  "p-groundnut-inshell": "Boil in the shell with salt or roast. Keep dry.",
  "p-bambara": "Soak overnight and cook long, or mill for okpa.",
  "p-pigeon-pea": "Soak, then simmer until soft. Keep dry.",
  "p-sese": "Needs long soaking and slow cooking.",
  "p-egusi": "Grind and fry in oil for egusi soup. Keep cool and dry.",
  "p-sesame": "Toast lightly and use on bread, in sauces or for oil. Store cool.",
  "p-sunflower": "Roast lightly for snacking. Keep sealed and cool.",
  "p-pineapple": "Ripe when fragrant at the base. Eat within 3–4 days or chill cut fruit.",
  "p-watermelon": "Chill before cutting. A ripe one sounds hollow when tapped.",
  "p-orange": "Keep cool; they last about a week, longer in the fridge.",
  "p-banana": "Ripen at room temperature; keep away from other fruit if you want them slower.",
  "p-plantain-unripe": "Keep at room temperature; use within a week or let it ripen.",
  "p-plantain-ripe": "Use within 2–3 days; peel and freeze extras for dodo.",
  "p-pawpaw": "Ripe when the skin yellows and gives slightly. Chill and eat within 3 days.",
  "p-mango": "Ripen at room temperature, then refrigerate.",
  "p-avocado": "Ripe when it gives under gentle pressure. Keep cut halves with the stone.",
  "p-coconut": "Drink the water first, then eat or grate the flesh for rice and snacks.",
  "p-cashew": "Roast lightly before eating. Keep sealed in a cool place.",
  "p-kolanut": "Keep damp in a leaf or cloth so it stays fresh.",
  "p-oha": "Tear (do not cut) and add late in cooking. Use within 2 days.",
  "p-afang": "Slice very thin, pound or blend, and cook with waterleaf. Use within 2 days.",
  "p-cauliflower": "Steam, roast or stir-fry. Keep chilled up to a week.",
  "p-broccoli": "Steam lightly to keep the colour. Use within 4–5 days.",
  "p-bellpepper-green": "Keep dry in the fridge up to 10 days.",
  "p-spring-onion": "Wrap in a damp cloth in the fridge; use within a week.",
  "p-celery": "Keep upright in water in the fridge for up to 2 weeks.",
  "p-garlic": "Store dry and airy for months; crush fresh for the best flavour.",
  "p-uziza-leaf": "Slice fine and add near the end. Use within 3 days or dry.",
  "p-uziza-seed": "Grind and use sparingly in pepper soup and stews. Keep sealed.",
  "p-utazi": "Wash and slice fine; a little goes a long way.",
  "p-lemongrass": "Boil as tea or add to soups. Freezes well.",
  "p-cloves": "Use one or two per pot; keep sealed away from light.",
  "p-ehuru": "Toast, crack and grind just before using.",
  "p-atare": "Crush the seeds and use in small amounts.",
  "p-uda": "Toast and crush before use; keep sealed.",
  "p-thyme": "Add early to stews. Keep in an airtight jar.",
  "p-bayleaf": "Add whole and remove before serving.",
  "p-blackpepper": "Grind fresh for the best flavour; keep sealed.",
  "p-palm-oil": "Keep sealed away from heat. It may solidify in cool weather; warm gently to pour.",
  "p-groundnut-oil": "Good for frying at high heat. Store in a cool, dark place.",
  "p-yam-flour": "Stir into boiling water for amala; keep sealed and dry.",
  "p-plantain-flour": "Stir into hot water like amala. Keep dry.",
  "p-tapioca": "Soak and boil until clear. Keep dry.",
  "p-iru": "Keep refrigerated or frozen; add to soup after the oil is hot.",
  "p-ogbono": "Grind and stir into hot palm oil for ogbono soup. Keep sealed.",
  "p-kulikuli": "Eat with garri and sugar or on its own. Keep dry and sealed.",
  "p-wara": "Keep in water in the fridge and eat within 3–4 days.",
  "l-goat": "Keep in a clean, dry pen with water. Comes with a vet health certificate.",
  "l-sheep": "Provide shade and clean water on arrival. Comes with a vet health certificate.",
  "l-ram": "Order early before festivals. Comes with a vet health certificate.",
  "l-rabbit": "Keep cool, dry and shaded; feed greens and pellets.",
  "l-beef": "Refrigerate and cook within 2 days, or freeze in portions.",
  "l-goatmeat": "Refrigerate and cook within 2 days, or freeze.",
  "l-honey": "Store sealed at room temperature; it may crystallise, which is natural.",
  "l-milk": "Keep refrigerated and boil before drinking; use within 2 days.",
  "l-snail": "Keep in a cool, damp, ventilated container and cook within a few days.",
  "l-layer": "Provide layer mash, clean water and nesting boxes.",
  "l-local-chicken": "Ideal for pepper soup and traditional dishes.",
  "l-cockerel": "Keep in a ventilated cage and cook or rear soon.",
  "l-turkey": "Order early for festive seasons. Comes with a vet certificate.",
  "l-duck": "Provide clean water for drinking and a dry shelter.",
  "l-guinea-fowl": "Keep in an enclosure with shade and water.",
  "l-quail-eggs": "Boil 3–4 minutes for snacks and salads. Keep cool.",
  "l-doc": "Provide warmth (brooder), clean water and starter feed immediately.",
  "l-chicken-parts": "Refrigerate and cook within 2 days, or freeze.",
  "l-catfish-live": "Keep in water until cooking. Great for pepper soup and grilling.",
  "l-catfish-smoked": "Wash briefly and add to soup. Keeps well when frozen.",
  "l-tilapia-fresh": "Cook the same day or freeze. Good grilled or in pepper soup.",
  "l-tilapia-smoked": "Rinse and add near the end of cooking.",
  "l-titus": "Thaw in the fridge and cook the same day.",
  "l-croaker": "Thaw slowly in the fridge before cooking.",
  "l-stockfish": "Soak in hot water until soft, then clean and cook.",
  "l-bonga": "Rinse, debone and add to soup for flavour.",
  "l-crayfish": "Grind or use whole; keep sealed in a dry place.",
  "l-prawns": "Cook quickly (3–4 minutes) to keep them tender.",
  "l-fingerlings": "Acclimatise slowly to pond water before releasing."
}; /*ITEM_TIPS_END*/

  var UNIT_NOTES = {
    derica: 'A derica is the metal tin traditionally used as a measure in Nigerian markets (about the size of a large evaporated-milk tin). It holds roughly 1.5–2 kg of rice or beans and a little less of light items like garri or flour. Each product shows the weight we use, for example "Derica (≈1.7 kg)".',
    mudu: 'A mudù is the Hausa measure, a small tin or bowl that holds roughly 1.4–1.5 kg of grains such as sorghum, millet or bambara nuts.',
    paint_rubber: 'A paint rubber is the plastic paint-bucket measure. It holds roughly 4–5 kg of grains or beans (about 2.5 dericas); lighter items like in-shell groundnuts weigh less.',
    tin: 'A tin is the small milk-tin measure, roughly 0.35–0.4 kg of items such as locust beans, ogbono, egusi or crayfish.',
    bowl: 'A bowl is the enamel bowl measure used for peppers, okra, tiger nuts, kola and similar items, roughly 0.5–2.5 kg depending on the item.',
    basin: 'A basin is a large wash-basin full, roughly 5–10 kg depending on what it holds.',
    bucket: 'A bucket is a household bucket measure, roughly 10 litres or about 8–12 kg of produce.',
    basket: 'A basket is the woven market basket, roughly 10–25 kg depending on the produce (tomatoes about 25 kg, peppers around 15 kg).',
    heap: 'A heap is a small market pile of a few pieces, usually about 0.25–1.5 kg depending on the item; each product shows its approximate weight.',
    bunch: 'A bunch is a tied handful of leaves or a cluster of fruit. A bundle is several bunches tied together (usually 5). A hand is one cluster of bananas or plantain, and a bunch of plantain has about 5 hands.',
    bundle: 'A bundle is several bunches tied together (usually 5 for leafy vegetables).',
    hand: 'A hand is one cluster of bananas or plantain; a full bunch has about 5–6 hands.',
    bag: 'A bag is a full sack of grain, flour, garri or produce; the weight is shown on the product (for example "Bag (50 kg)").',
    sack: 'A sack is a large woven sack, usually 50–100 kg depending on the item.',
    carton: 'A carton is a box: 10 kg for frozen fish or tapioca, 12 crates for eggs, 100 birds for day-old chicks.',
    crate: 'A crate holds 30 eggs, or a standard tray crate of fruit or vegetables.',
    jerrycan: 'A jerrycan is a plastic container, 5 litres or 25 litres for oils and honey; the size is shown on the product.',
    dozen: 'A dozen is 12 pieces.',
    pair: 'A pair is 2 animals or items.',
    flock: 'A flock is a group of birds or sheep sold together (the number is shown on the product).',
    herd: 'A herd is a group of cattle or goats sold together (the number is shown on the product).',
    pond: 'A pond lot is enough fingerlings to stock a pond (the number is shown on the product).',
    carcass: 'A carcass is a whole dressed animal, for example a whole dressed pig of about 60 kg.'
  };

  var DISHES = {
    jollof: ['tomato', 'tatashe', 'rodo', 'onion', 'rice', 'ginger'],
    'fried rice': ['rice', 'carrot', 'green beans', 'onion', 'broiler'],
    'efo riro': ['ugu', 'spinach', 'tatashe', 'rodo', 'onion', 'tomato'],
    egusi: ['ugu', 'bitter', 'onion', 'rodo'],
    'pepper soup': ['rodo', 'scent', 'ginger', 'cameroon', 'pork', 'broiler'],
    ewedu: ['ewedu'],
    amala: ['lafun', 'ewedu'],
    'pounded yam': ['yam'],
    eba: ['garri'],
    'ofada stew': ['ofada', 'tatashe', 'rodo', 'onion'],
    'vegetable soup': ['ugu', 'waterleaf', 'spinach', 'onion', 'rodo'],
    salad: ['lettuce', 'cabbage', 'cucumber', 'carrot', 'tomato', 'eggs'],
    stew: ['tomato', 'tatashe', 'rodo', 'onion'],
    kunun: ['tiger'], 'moi moi': ['brown beans', 'white beans', 'onion', 'rodo', 'tatashe', 'palm oil', 'crayfish'], akara: ['white beans', 'onion', 'rodo', 'groundnut oil'],
    'egusi soup': ['egusi', 'ugu', 'stockfish', 'crayfish', 'palm oil', 'onion', 'rodo'], 'ogbono soup': ['ogbono', 'palm oil', 'stockfish', 'crayfish', 'ugu'], 'oha soup': ['oha', 'ogbono', 'stockfish', 'palm oil', 'crayfish'],
    'afang soup': ['afang', 'waterleaf', 'stockfish', 'crayfish', 'palm oil'], 'fruit salad': ['pineapple', 'watermelon', 'oranges', 'pawpaw', 'mango'], smoothie: ['banana', 'pineapple', 'mango', 'avocado', 'oats'],
    dodo: ['ripe plantain', 'groundnut oil'], 'fish stew': ['tilapia', 'tomato', 'tatashe', 'rodo', 'onion', 'palm oil'], 'ayamase': ['green bell pepper', 'palm oil', 'onion', 'iru'], pap: ['white maize', 'sorghum'], 'fura': ['millet'],
    porridge: ['yam', 'potato', 'tomato', 'rodo', 'onion']
  };

  // ======================================================================
  // TOPICS — matching table: pattern → handler
  // ======================================================================
  var TOPICS = [
    { id: 'order', re: /\b(how (do|can|to|should) (i )?(order|buy|shop|purchase|place|checkout|check out|pay for)|place (an )?order|make (an )?order|start ordering|buying process|ordering process|how does (it|this|the site|bouesti) work|how it works|steps? to (order|buy))\b/, guide: 'order', chips: ['Delivery fees', 'How can I pay?', 'Create an account'] },
    { id: 'signup', re: /\b(sign ?up|register|create (an )?account|open (an )?account|new account|join)\b/, guide: 'signup', chips: ['How do I log in?', 'How do I order?'] },
    { id: 'forgot', re: /\b(forgot|forget|reset|recover|lost|change)\b.*\b(password|pin)\b|\bpassword\b.*\b(forgot|reset|recover|lost)\b/, guide: 'forgot', chips: ['How do I log in?'] },
    { id: 'login', re: /\b(log ?in|sign ?in|can.?t (log|sign)|cannot (log|sign)|unable to (log|sign)|login (problem|issue|error|not working)|incorrect (email|password)|wrong password|password (not|is not))\b/, guide: 'login', chips: ['Reset my password', 'Create an account'] },
    { id: 'track', re: /\b(track(ing)?|where is my (order|goods|food|package)|order status|status of (my )?order|follow (my )?order|my order (is|has)|gps|rider|dispatch|on the road|can.?t (see|find) my order|check (my )?order)\b/, guide: 'track', chips: ['Where is my order stuck?', 'How do I get my receipt?', 'Delivery time'] },
    { id: 'claim', re: /\b(how (do|can|to) (i )?(claim|report|complain|get (a )?refund)|make (a )?claim|file (a )?(claim|complaint)|claims? (desk|process|procedure)|refund process|return (policy|an item|goods)|how long (do i|to) (have|report)|report (a )?problem)\b/, guide: 'claim', chips: ['What is covered?', 'Log a complaint'] },
    { id: 'sell', re: /\b(sell (my|on|with|through|here|produce|livestock)|list (my|our|a|an)|become a (seller|vendor|supplier)|start (selling|listing)|i am a (farmer|breeder)|i.?m a (farmer|breeder)|i (grow|farm|rear|breed|have (a )?farm)|farmer|breeder|supplier|vendor|apply to sell|seller)\b/, guide: 'sell', chips: ['Is listing free?', 'What documents do I need?'] },
    { id: 'sellreq', re: /\b(documents?|requirements?|papers|what do i need)\b.*\b(sell|list|seller|farmer|listing)\b|\b(sell|list|seller|farmer|listing)\b.*\b(documents?|requirements?|papers)\b|^(what )?documents?( do i need)?\??$/, answer: 'sellDocs', chips: ['How do I start selling?', 'Is listing free?'] },
    { id: 'search', re: /\b(search|find (a |an |the )?(product|item)|filter|look for|where (can|do) i find|categories|browse)\b/, guide: 'search', chips: ['What do you sell?'] },
    { id: 'cart', re: /\b(cart|checkout page|add to cart|remove (from )?(the )?cart|quantity|change quantity)\b/, guide: 'cart', chips: ['How do I order?', 'Delivery fees'] },
    { id: 'myorders', re: /\b(my orders|order history|past orders|previous orders|orders i (made|placed))\b/, guide: 'myorders', chips: ['Track my order', 'Get my receipt'] },
    { id: 'receipt', re: /\b(receipt|invoice|proof of (purchase|payment)|print)\b/, guide: 'receipt', chips: ['Track my order'] },
    { id: 'contact', re: /\b(contact|phone number|call (you|us|the)|whatsapp|email address|your email|address|office|location of|where are you|opening hours|working hours|hours|open on|customer (care|service|support))\b/, answer: 'contact', chips: ['Log a complaint', 'How do I track my order?'] }
  ];

  var STOP = {}; ('a an the is are was were be do does did i me my we you your our it its of to for on in at and or but with from by about this that these those ' +
    'please pls tell can could would will how what which who when where why much many any some have has get got want need like buy order price cost sell selling available stock ' +
    'naira abeg wetin dey be na per kg fresh there here am im ive yes no ok okay hi hello show list give display items products types kinds options names all farm start starting begin').split(' ').forEach(function (w) { STOP[w] = 1; });

  var SYN = {
    corn: 'maize', cob: 'maize', potatoes: 'potato', chickens: 'chicken', hens: 'hen', fowl: 'chicken', cow: 'cattle', cows: 'cattle', goats: 'goat', sheeps: 'sheep', rams: 'ram', rabbits: 'rabbit', snails: 'snail', ducks: 'duck', turkeys: 'turkey', peanut: 'groundnut', peanuts: 'groundnut', groundnuts: 'groundnut', papaya: 'pawpaw', sesame: 'beniseed', melon: 'egusi', mackerel: 'titus', okporoko: 'stockfish', shawa: 'bonga', prawn: 'prawns', shrimp: 'prawns', shrimps: 'prawns', cheese: 'wara', wheat: 'wheat', fonio: 'acha', sorghum: 'guinea', cashews: 'cashew', cola: 'kolanut', kola: 'kola', oils: 'oil', honey: 'honey',
    beef: 'cattle', bull: 'cattle', pigs: 'pig', piglet: 'weaner', piglets: 'weaner', swine: 'pig', egg: 'eggs', tubers: 'yam', ewura: 'water',
    scotch: 'rodo', bonnet: 'rodo', habanero: 'rodo', bell: 'tatashe', cayenne: 'shombo', chilli: 'wewe', chili: 'wewe', ijosi: 'cameroon', pumpkinleaf: 'ugu',
    jute: 'ewedu', amaranth: 'tete', celosia: 'shoko', efirin: 'scent', tomatoes: 'tomato', onions: 'onion', carrots: 'carrot', cucumbers: 'cucumber',
    peppers: 'pepper', ofada: 'ofada', gari: 'garri', taro: 'cocoyam', kunun: 'tiger', aya: 'tiger', bunaji: 'fulani', rahaji: 'bororo',
    sokoto: 'gudali', cabbages: 'cabbage', lettuces: 'lettuce', beansgreen: 'beans', eggplant: 'garden', aubergine: 'garden', pork: 'pork', fishes: 'fish', beetroots: 'beetroot', oranges: 'orange', bananas: 'banana', plantains: 'plantain', mangoes: 'mango', mangos: 'mango', avocados: 'avocado', coconuts: 'coconut', pineapples: 'pineapple', watermelons: 'watermelon', garlics: 'garlic'
  };

  function naira(n) { return '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 }); }
  function words(text) { return String(text).toLowerCase().replace(/[^a-z0-9₦\s/-]/g, ' ').split(/\s+/).filter(Boolean); }
  function stem(w) { return w.replace(/ies$/, 'y').replace(/(es|s)$/, function (m, g, off, str) { return str.length > 4 ? '' : m; }); }
  function has(text, re) { return re.test(text); }

  // ======================================================================
  // The knowledge text (also given to Claude on the server)
  // ======================================================================
  function knowledgeText(f) {
    var produce = f.products.filter(function (p) { return p.kind === 'produce'; });
    var live = f.products.filter(function (p) { return p.kind === 'livestock'; });
    var line = function (p) {
      return '- ' + p.name + ' [' + (SUB_LABELS[p.sub] || p.sub) + ']: ' + naira(p.price) + ' per ' + Units.name(p.unit) +
        (p.modes && p.modes.indexOf('processed') >= 0 && p.processedPrice ? ' live, ' + naira(p.processedPrice) + '/kg processed' : '') +
        '; ' + (p.stock > 0 ? p.stock + ' in stock' : 'OUT OF STOCK') + (p.measures && p.measures.length ? '; ways to buy: ' + p.measures.map(function (m) { return m.label + ' ' + naira(Units.priceFor(p.price, m.qty)); }).join(', ') : '') +
        (p.desc ? '. ' + p.desc : '');
    };
    var tail = function (obj) { return Object.keys(obj).map(function (k) { return '- ' + k + ': ' + obj[k]; }).join('\n'); };
    return [
      '# ' + f.name, POLICY.about, POLICY.categories, POLICY.sections, '',
      '## Contact', 'WhatsApp / phone: ' + f.phone + '  Email: ' + f.email + '  Base: ' + f.address, POLICY.hours, '',
      '## Delivery fees by state (per order)', f.states.map(function (s) { return '- ' + s.name + ': ' + naira(s.fee); }).join('\n'),
      POLICY.delivery, POLICY.deliveryTime, POLICY.lgas, '',
      '## Fees, prices and payment', 'Service fee: ' + f.feePct + '% of the goods, paid by the buyer. Total = goods + service fee + state delivery fee.', POLICY.fees, POLICY.priceRules, POLICY.stock, POLICY.payment, '',
      '## Step-by-step guides', Object.keys(GUIDES).map(function (k) { return '[' + k + '] ' + GUIDES[k]; }).join('\n\n'), '',
      '## Orders, receipts, cancellations', POLICY.receipts, POLICY.cancel, POLICY.bulk, '',
      '## Buyer protection and claims', POLICY.protection, POLICY.insurance, POLICY.covered, POLICY.notCovered, '',
      '## Accounts', POLICY.account, POLICY.password, POLICY.twoFa, '',
      '## Selling on the marketplace', POLICY.sell, '',
      '## Customer care', POLICY.complaints, POLICY.notifications, POLICY.theme, '',
      '## Product knowledge (uses and storage)', tail(PRODUCT_NOTES), '',
      '## Item tips', f.products.filter(function (p) { return p.sku && ITEM_TIPS[p.sku]; }).map(function (p) { return '- ' + p.name + ': ' + ITEM_TIPS[p.sku]; }).join('\n'), '',
      '## Livestock knowledge', tail(LIVESTOCK_NOTES), '',
      '## Dishes and what to buy', Object.keys(DISHES).map(function (d) { return '- ' + d + ': ' + DISHES[d].join(', '); }).join('\n'), '',
      '## Produce on sale now (live prices and stock)', produce.map(line).join('\n'), '',
      '## Livestock on sale now (live prices and stock)', live.map(line).join('\n'),
      f.announcements && f.announcements.length ? '\n## Latest announcements\n' + f.announcements.map(function (a) { return '- ' + a.title + (a.message ? ': ' + a.message : ''); }).join('\n') : ''
    ].join('\n');
  }

  // ======================================================================
  // The engine
  // ======================================================================
  function createEngine(opts) {
    var getFacts = opts.getFacts;
    var lookupOrder = opts.lookupOrder || function () { return null; };

    function stockText(p) {
      if (p.stock <= 0) return 'out of stock right now';
      if (p.stock <= 5) return 'only ' + p.stock + ' left';
      return p.stock + ' in stock';
    }
    function priceLine(p) {
      var s = '**' + p.name + '** — ' + naira(p.price) + ' per ' + Units.name(p.unit);
      if (p.modes && p.modes.indexOf('processed') >= 0 && p.processedPrice) s = '**' + p.name + '** — ' + naira(p.price) + '/kg live, ' + naira(p.processedPrice) + '/kg processed';
      s += ' (' + stockText(p) + ')';
      if (p.measures && p.measures.length > 1) s += '. You can buy by: ' + p.measures.slice(0, 5).map(function (m) { return m.label + ' ' + naira(Units.priceFor(p.price, m.qty)); }).join(', ');
      return s;
    }
    var ALIAS = [[/broiler/, 'chicken'], [/layer/, 'chicken hen'], [/cockerel|free-range/, 'chicken'], [/drumsticks|parts/, 'chicken'], [/maize/, 'corn'], [/yellow yam/, 'yam'], [/white yam/, 'yam'],
      [/guinea corn/, 'sorghum'], [/pearl millet/, 'jero'], [/pawpaw/, 'papaya'], [/beniseed/, 'sesame'], [/egusi/, 'melon'], [/stockfish/, 'okporoko'], [/titus/, 'mackerel'], [/bonga/, 'shawa'],
      [/wara/, 'cheese'], [/honey/, 'bee'], [/milk/, 'dairy'], [/sweet corn/, 'maize'], [/rodo/, 'scotch bonnet habanero'], [/tatashe/, 'bell'], [/shombo/, 'cayenne'], [/prawns/, 'shrimp'], [/groundnut/, 'peanut'],
      [/kuli/, 'groundnut'], [/ogbono/, 'mango'], [/iru/, 'locust'], [/oha/, 'ora']];
    function nameTokens(p) {
      var base = words(p.name), n = p.name.toLowerCase();
      ALIAS.forEach(function (a) { if (a[0].test(n)) base = base.concat(words(a[1])); });
      return base.map(stem);
    }

    function findProducts(text, f) {
      var q = words(text).map(function (w) { return SYN[w] || w; }).map(stem).filter(function (w) { return w.length >= 3 && !STOP[w]; });
      if (!q.length) return [];
      var scored = f.products.map(function (p) {
        var nt = nameTokens(p), dt = words(p.desc || '').map(stem), score = 0;
        q.forEach(function (w) {
          if (nt.indexOf(w) >= 0) score += 3;
          else if (w.length >= 4 && nt.some(function (t) { return t.indexOf(w) === 0; })) score += 2;
          else if (dt.indexOf(w) >= 0) score += 0.5;
        });
        return { p: p, score: score };
      }).filter(function (x) { return x.score >= 2.5; }).sort(function (a, b) { return b.score - a.score; });
      if (!scored.length) return [];
      var top = scored[0].score;
      return scored.filter(function (x) { return x.score >= top - 1; }).slice(0, 5).map(function (x) { return x.p; });
    }

    var CATEGORY_TIPS = {
      tubers: 'Store tubers and root crops in a cool, dry, ventilated place, never sealed in plastic.', grains: 'Keep grains and cereals dry, sealed and off the floor to stop moisture and pests.',
      legumes: 'Keep legumes and oilseeds dry and sealed; soak beans before cooking and boil seeds like soybeans thoroughly.', fruits: 'Most fruits ripen at room temperature; refrigerate once ripe. Nuts keep best sealed and cool.',
      vegetables: 'Keep fresh vegetables cool and use leafy ones within 2–3 days.', spices: 'Keep spices and dried herbs in airtight jars away from light and damp; fresh herbs keep a few days in the fridge.',
      processed: 'Keep processed products sealed, cool and dry and check the label dates.', livestock: 'Livestock orders come with a vet health certificate; give water and shade on arrival. Fresh meat should be refrigerated and cooked within 2 days.',
      poultry: 'Poultry orders come with a vet health certificate; give clean water and ventilation. Fresh poultry meat should be refrigerated and cooked within 2 days.', fish: 'Cook fresh fish the same day or freeze it. Smoked and dried fish keep longer when stored dry and sealed.'
    };
    function noteFor(p) {
      if (p.sku && ITEM_TIPS[p.sku]) return ITEM_TIPS[p.sku];
      var nt = nameTokens(p), n = words(p.name).join(' ');
      if (/duroc|landrace|large white|fulani|gudali|bororo/.test(n)) {
        var key = /duroc/.test(n) ? 'duroc' : /landrace/.test(n) ? 'landrace' : /large white/.test(n) ? 'largewhite' : /fulani/.test(n) ? 'fulani' : /gudali/.test(n) ? 'gudali' : 'bororo';
        return LIVESTOCK_NOTES[key];
      }
      var order = ['rodo', 'tatashe', 'shombo', 'wewe', 'cameroon', 'ofada', 'garri', 'lafun', 'fufu', 'water', 'cocoyam', 'irish', 'potato', 'cassava', 'tiger', 'garden', 'ugu', 'ewedu', 'waterleaf', 'bitter', 'scent', 'tete', 'shoko', 'chicks', 'weaner', 'pork', 'broiler', 'eggs', 'pig', 'yam', 'pepper', 'tomato', 'cucumber', 'carrot', 'cabbage', 'lettuce', 'spinach', 'okra', 'maize', 'onion', 'ginger', 'turmeric', 'beans', 'pumpkin', 'rice'];
      for (var i = 0; i < order.length; i++) {
        var k = order[i];
        if (nt.indexOf(stem(k)) >= 0 || (k === 'waterleaf' && /waterleaf/.test(n)) || (k === 'water' && /water yam/.test(n)) || (k === 'bitter' && /bitter/.test(n)) || (k === 'tiger' && /tiger/.test(n)) || (k === 'garden' && /garden/.test(n))) {
          if (k === 'water' && !/water yam/.test(n)) continue;
          if (k === 'pig' && /pork|weaner/.test(n)) continue;
          return PRODUCT_NOTES[k] || null;
        }
      }
      return CATEGORY_TIPS[p.sub] || null;
    }

    function findState(text, f) {
      var t = ' ' + String(text).toLowerCase().replace(/[^a-z\s-]/g, ' ') + ' ', best = null, bestAt = -1;
      f.states.forEach(function (s) {
        var at = t.lastIndexOf(' ' + s.name.toLowerCase() + ' ');
        if (at > bestAt) { best = s; bestAt = at; }
      });
      if (best) return best;
      if (/\b(ado|ado-ekiti|ikere|ikole|ijero|oye|efon|emure|gbonyin|ido-?osi|ilejemeje|moba|ise|orun|irepodun|ifelodun|ekiti)\b/.test(t)) {
        return f.states.filter(function (s) { return s.name === 'Ekiti'; })[0] || null;
      }
      return null;
    }

    function waLink(f) { var d = String(f.phone).replace(/\D/g, ''); return 'https://wa.me/' + (d.indexOf('234') === 0 ? d : '234' + d.replace(/^0/, '')); }

    function sectionOverview(f, kind) {
      return CATEGORY_ORDER.filter(function (k) { return f.products.some(function (p) { return p.kind === kind && p.sub === k; }); }).map(function (k) {
        var l = f.products.filter(function (p) { return p.sub === k; });
        return '• ' + SUB_LABELS[k] + ' (' + l.length + '): ' + l.slice(0, 4).map(function (p) { return p.name.replace(/\s*\(.*\)/, ''); }).join(', ') + (l.length > 4 ? ', …' : '');
      }).join('\n');
    }

    var COMPLAINT_RE = /\b(complain|complaint|report (a|an|my|this)|refund|money back|scam|cheat(ed)?|fraud|rotten|spoil(ed|t)?|damaged|stale|broken|cracked|smell(s|y)?|expired|dead on arrival|wrong (item|order|weight|size|breed|price|charge|amount)|not (yet )?(deliver|receive|arriv)|nobody (deliver|came|brought)|no ?one (deliver|came|brought)|never (arrive|came|reach|deliver)|did(n.?t| not) (arrive|come|reach|get|deliver)|have(n.?t| not) (received|gotten|got)|still waiting|missing|overcharg|double charge|charged (me )?(twice|more)|bad (service|experience|quality)|(was|is|were|are) (bad|poor|terrible|awful)|terrible|awful|worst|useless|rude|disappoint(ed|ing)?|unhappy|angry|dispute|(problem|issue|trouble) with (my|the) (order|delivery|payment)|(late|delay(ed)?) (delivery|order)|(came|arrived|delivered) (very |too |so )?late|(was|is|so|too) late|sick|injured|died)\b/;

    function complaintCategory(t) {
      if (has(t, /not (been )?deliver|never (arrive|came|reach|deliver)|did(n.?t| not) (arrive|come|reach|deliver)|nobody (deliver|came|brought)|no ?one (deliver|came|brought)|have(n.?t| not) (received|gotten|got)|not received|missing|no delivery/)) return 'not_delivered';
      if (has(t, /late|delay|still waiting|too long|slow/)) return 'late_delivery';
      if (has(t, /wrong (item|weight|size|pack|breed|type|order)|not (as )?described|different from|not what i ordered|short weight/)) return 'wrong_item';
      if (has(t, /rotten|spoil|spoilt|bad (produce|tomato|pepper|yam|egg)|damaged|broken|cracked|smell|expired|stale|quality/)) return 'poor_quality';
      if (has(t, /sick|injur|dead|died|disease|health cert|limp/)) return 'livestock_issue';
      if (has(t, /overcharg|charged (me )?(more|twice)|double charge|refund|money back|wrong (price|charge|amount)/)) return 'wrong_charge';
      if (has(t, /payment|paid|paystack|transfer|debit/)) return 'payment';
      if (has(t, /login|log in|password|account|sign ?up|verify|code/)) return 'account';
      if (has(t, /website|site|app|page|error|bug|crash|not loading/)) return 'website';
      return 'other';
    }

    function listProducts(list, header, limit) {
      var shown = list.slice(0, limit || 8);
      return header + '\n' + shown.map(function (p) { return '• ' + priceLine(p); }).join('\n') + (list.length > shown.length ? '\n…and ' + (list.length - shown.length) + ' more.' : '');
    }

    var CATEGORY_WORDS = [
      ['tubers', /\b(tubers?|roots?|root crops?)\b/], ['grains', /\b(grains?|cereals?)\b/], ['legumes', /\b(legumes?|oilseeds?|pulses?|seeds?)\b/],
      ['fruits', /\b(fruits?|nuts?)\b/], ['vegetables', /\b(vegetables?|veggies|leafy|greens)\b/], ['spices', /\b(spices?|herbs?|seasonings?|condiments?)\b/],
      ['processed', /\b(processed|processing)\b/], ['livestock', /\b(livestock|animals?|farm animals?)\b/], ['poultry', /\b(poultry|birds?)\b/], ['fish', /\b(fish|fishes|aquaculture|seafood)\b/]
    ];
    function categoryKey(t) { for (var i = 0; i < CATEGORY_WORDS.length; i++) if (CATEGORY_WORDS[i][1].test(t)) return CATEGORY_WORDS[i][0]; return null; }
    function categoryPool(t, f) {
      var k = categoryKey(t);
      if (k) return f.products.filter(function (p) { return p.sub === k; });
      if (/\b(produce|farm products?)\b/.test(t)) return f.products.filter(function (p) { return p.kind === 'produce'; });
      if (/\b(pigs?|pork)\b/.test(t)) return f.products.filter(function (p) { return /pig|pork/i.test(p.name); });
      if (/\b(cattle|cows?|beef)\b/.test(t)) return f.products.filter(function (p) { return /cattle|beef/i.test(p.name); });
      return null;
    }
    // true when the question names only a category ("what fish do you have", "show me spices")
    function categoryOnly(raw) {
      var toks = words(raw).map(function (w) { return SYN[w] || w; }).filter(function (w) { return w.length >= 3 && !STOP[w]; });
      if (!toks.length) return null;
      var k = null;
      for (var i = 0; i < toks.length; i++) {
        var hit = null;
        for (var j = 0; j < CATEGORY_WORDS.length; j++) if (CATEGORY_WORDS[j][1].test(toks[i])) { hit = CATEGORY_WORDS[j][0]; break; }
        if (!hit) return null;
        k = k || hit;
      }
      return k;
    }
    var NG_PLACES = /\b(lagos|abuja|fct|oyo|ibadan|rivers|port harcourt|kano|kaduna|enugu|anambra|imo|abia|delta|benin|bayelsa|cross river|akwa ibom|plateau|jos|benue|niger|bauchi|borno|gombe|adamawa|taraba|nasarawa|katsina|sokoto|kebbi|zamfara|jigawa|yobe|ebonyi)\b/;

    // The main brain ------------------------------------------------------
    function answer(message, history) {
      var f = getFacts();
      var raw = String(message || '').trim();
      var t = raw.toLowerCase();
      var wa = waLink(f);
      var R = function (reply, extra) { return Object.assign({ reply: reply, chips: [] }, extra || {}); };

      if (!raw) return R('Hi! Ask me about prices, delivery, payments, tracking, buyer protection or anything on the website, or tell me about a problem with an order.');

      // ---- order reference lookup
      var ref = raw.match(/\b(BM-\d{8}-\d{3,5}|BST-[A-Z0-9]{4,8})\b/i);
      if (ref && !COMPLAINT_RE.test(t)) {
        var o = lookupOrder(ref[0].toUpperCase());
        if (!o) return R('I could not find an order with reference ' + ref[0].toUpperCase() + ' here. Check it on your receipt or under My Orders (log in with the account you ordered with). ' + GUIDES.track.split('\n')[0] + ' If the order was placed on a different account or device it will not show.', { chips: ['How do I track my order?', 'Log a complaint'] });
        var nice = { pending: 'received and waiting to be confirmed', processing: 'being prepared / on its way', delivered: 'marked as delivered', cancelled: 'cancelled' }[o.status] || o.status;
        return R('Order ' + ref[0].toUpperCase() + ' is ' + nice + (o.paymentStatus ? '. Payment: ' + o.paymentStatus : '') + (o.deliveryDate ? '. Planned delivery date: ' + o.deliveryDate : '') + '. Open Track order (log in first) to follow it. If something is wrong with it, tell me and I will open a complaint for you.', { chips: ['How do I track my order?', 'Log a complaint'] });
      }
      if (/\bCC-\d{8}-\d{3,5}\b/i.test(raw)) return R('To read the team\'s replies to complaint ' + raw.match(/\bCC-\d{8}-\d{3,5}\b/i)[0].toUpperCase() + ', open the Support section, find "Track a complaint", and enter that reference with the phone number or email you used. You can also add a message there.', { chips: ['Log a complaint'] });

      // ---- complaint intent
      if (COMPLAINT_RE.test(t) && !/\b(how (do|can|to|long)|what is|what happens|what will happen|when will|policy|process|procedure|covered|claim desk|after i)\b/.test(t)) {
        return R('I am sorry that happened — let us get it to the team. Claims should be reported within 24 hours of delivery. I have opened the complaint form for you: fill in your name, phone or email, your order reference and what went wrong. If you have photos of the problem, keep them ready; they speed up the decision. You will get a reference number and can see the team\'s reply under "Track a complaint" in the Support section.',
          { action: 'complaint', category: complaintCategory(t), chips: ['What is covered?', 'What happens after I complain?'] });
      }
      if (has(t, /\b(human|real person|agent|speak to (a |an )?(person|someone|human|staff)|talk to (a |an )?(person|someone|human|staff)|representative|call me)\b/)) {
        return R('I can answer most questions about the website myself, so tell me what you need. If you want a person to follow up on a specific problem, I can open the complaint form and the team replies to you on the site. You can also reach the desk by WhatsApp (' + f.phone + ') or email (' + f.email + '), Mon–Sat 7am–7pm.',
          { action: 'complaint', category: 'other', chips: ['How do I track my order?', 'Delivery fees'] });
      }

      // ---- small talk
      if (has(t, /^(hi|hello|hey|good (morning|afternoon|evening|day)|howdy|yo|sup|hola|how far|greetings|hi there)\b/) && words(t).length <= 6) {
        return R('Hello! I am the Bouesti Assistant. I can walk you through anything on the website: ordering, tracking, payments and delivery fees, product details and prices, buyer protection and claims, selling on Bouesti, accounts and logging in. What would you like to do?',
          { chips: ['What do you sell?', 'How do I track my order?', 'Delivery fees', 'How do I order?'] });
      }
      if (has(t, /^(thanks|thank you|thx|ty|tnx|much appreciated|appreciate|cool|ok(ay)?|great|nice|alright|got it|i see|perfect)\b/) && words(t).length <= 6) {
        return R('You are welcome! Is there anything else I can help you with?', { chips: ['What do you sell?', 'Delivery fees', 'Log a complaint'] });
      }
      if (has(t, /^(bye|goodbye|see you|later|that.?s all|no thanks?|nothing)\b/)) return R('Goodbye! Come back any time, fresh produce is always on the way.');
      if (has(t, /\b(who are you|what are you|what can you do|your name|are you (a )?(bot|robot|human|ai)|help me|^help$)\b/)) {
        return R('I am the Bouesti Assistant, an automated helper for this website. I can: show prices and stock for any product, work out an order total with delivery, guide you step by step (ordering, tracking, signing up, claims, selling), explain delivery, payment and buyer protection, suggest what to buy for a dish, and help you log a complaint.',
          { chips: ['What do you sell?', 'How do I track my order?', 'What can I cook with yam?'] });
      }

      // ---- questions about the measurement techniques themselves ("what is a derica", "how many kg in a paint rubber of beans")
      var uKey = null;
      Object.keys(UNIT_NOTES).forEach(function (k) {
        if (uKey || !Units.UNITS) return;
        var u = Units.UNITS[k], names = [u.name, u.plural, k.replace('_', ' ')].concat(u.aliases).filter(Boolean).map(function (x) { return String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
        if (new RegExp('\\b(' + names.join('|') + ')\\b', 'i').test(t)) uKey = k;
      });
      var uAsk = /\b(what('s| is| are)?|whats|meaning of|explain|mean|how (big|much|many|heavy)|size of|weigh|equal|kg in)\b/.test(t);
      if (uKey && uAsk) {
        var prodHit = findProducts(raw, f);
        var weighQ = /\b(kg in|weigh|how many kg|how heavy|how big)\b/.test(t);
        if (prodHit.length && (weighQ || !/\d/.test(t))) {
          var lines = [];
          prodHit.slice(0, 3).forEach(function (p) {
            (p.measures || []).filter(function (m) { return m.unit === uKey; }).forEach(function (m) {
              lines.push('• **' + p.name + '**: ' + (weighQ && m.kg ? 'one ' + Units.name(uKey) + ' is about ' + Units.fmt(m.kg) + ' kg, ' : m.label + ', ') + naira(Units.priceFor(p.price, m.qty)));
            });
          });
          if (lines.length) return R(lines.join('\n'), { chips: ['Delivery fees', 'How do I order?'] });
        }
        if (!prodHit.length) {
          var usedBy = f.products.filter(function (p) { return p.unit === uKey || (p.measures || []).some(function (m) { return m.unit === uKey; }); }).slice(0, 5).map(function (p) { return p.name; });
          return R(UNIT_NOTES[uKey] + (usedBy.length ? '\nYou can buy this way: ' + usedBy.join(', ') + '.' : ''), { chips: ['What measurements do you use?', 'How do I order?'] });
        }
      }
      if (/\b(measure(ment)?s?|units?|measuring)\b/.test(t) && /\b(what|which|how|list|use|used|do you)\b/.test(t) && !findProducts(raw, f).length) {
        var groups = Units.GROUPS ? Units.GROUPS.map(function (g) { return g; }) : [];
        return R('Each product is sold the way that suits it, so not everything is in kg. We use: weight (kg, g, tonne); volume (litre, mL); local market measures (derica, mudù, paint rubber, tin, bowl, basin, bucket, basket); bunches and heaps (bunch, bundle, heap, hand, bale); containers (bag, sack, crate, tray, carton, packet, pack, sachet, bottle, jerrycan, tank); counts (piece, tuber, cob, head, bird, pair, dozen, fingerling, seedling, plant, carcass); and groups (flock, herd, colony, pond). The card shows what the price is per, and the product window lets you choose how to buy it. Ask me about any of them, for example "what is a derica?".', { chips: ['What is a derica?', 'What is a mudù?', 'How do I order?'] });
      }

      // ---- sell ON bouesti and other guides
      for (var i = 0; i < TOPICS.length; i++) {
        var tp = TOPICS[i];
        if (tp.re.test(t)) {
          if (tp.id === 'sell' && findProducts(raw, f).length && !/\b(my|on|with|through|here)\b/.test(t)) continue;
          if (tp.id === 'search' && /\b(price|how much|cost)\b/.test(t)) continue;
          if (tp.id === 'receipt' && /\bprint(er)?\b/.test(t) && !/receipt|invoice/.test(t)) continue;
          if (tp.id === 'cart' && /\b(quantity)\b/.test(t) && findProducts(raw, f).length) continue;
          if (tp.id === 'login' && /\b(track|order|rider|gps|map)\b/.test(t)) {
            return R(GUIDES.login + '\n\nOnce you are logged in, here is how to track your order:\n' + GUIDES.track.split('\n').slice(1, 5).join('\n'), { chips: tp.chips });
          }
          if (tp.guide) return R(GUIDES[tp.guide], { chips: tp.chips });
          if (tp.answer === 'sellDocs') return R(POLICY.sellDocs, { chips: tp.chips });
          if (tp.answer === 'contact') return R(GUIDES.contact + '\nWhatsApp: ' + f.phone + ' (' + wa + '). Email: ' + f.email + '. Base: ' + f.address + '. ' + POLICY.hours, { chips: tp.chips });
        }
      }

      // ---- total calculator
      var matched = findProducts(raw, f);
      var cleaned = raw.replace(/\b(BM-\d+-\d+|BST-[A-Z0-9]+)\b/gi, '');
      var um = cleaned.match(new RegExp('(\\d+(?:\\.\\d+)?)\\s*(' + Units.aliasPattern() + ')\\b', 'i'));
      var qm = um || cleaned.match(/(\d+(?:\.\d+)?)/);
      var state = findState(raw, f);
      var uwEarly = um ? Units.unitFromWord(um[2]) : null;
      var WEIGHT_U = { kg: 1, g: 1, tonne: 1 };
      var supports = function (p, u) {
        if (!u) return true;
        if (u === p.unit || (p.measures || []).some(function (m) { return m.unit === u; })) return true;
        return !!WEIGHT_U[u] && (p.unit === 'kg' || (p.measures || []).some(function (m) { return m.kg; }));
      };
      var calcSet = uwEarly ? matched.filter(function (p) { return supports(p, uwEarly); }) : matched;
      if (!calcSet.length) calcSet = matched;
      var qtyN = qm ? Number(qm[1]) : 0;
      if (calcSet.length && qm && qtyN > 0 && qtyN < 100000 && (um || has(t, /\b(total|cost|how much|price|pay|deliver|worth|come to|amount|naira|₦|buy|order|want|get|take|need)\b/)) && !has(t, /\b(per|each)\s+\w+\??$/)) {
        var p0 = calcSet[0], qty = qtyN;
        var uw = uwEarly;
        // several matching products (brown / white beans ...) with a clear quantity: give each one's total
        if (calcSet.length > 1 && uw && calcSet.length <= 3 && calcSet.every(function (p) { return supports(p, uw); })) {
          var stM = state || f.states.filter(function (s) { return s.name === 'Ekiti'; })[0] || f.states[0], delM = stM ? stM.fee : 0, linesM = [];
          calcSet.forEach(function (p) {
            var perM = 1, multM = qty, whatM = Units.qtyText(qty, p.unit);
            if (uw !== p.unit) {
              var cm = (p.measures || []).filter(function (m) { return m.unit === uw; })[0];
              if (cm) { perM = cm.qty; whatM = qty + ' × ' + cm.label; }
              else { var kgsM = uw === 'g' ? qty / 1000 : uw === 'tonne' ? qty * 1000 : qty, kgPerM = p.unit === 'kg' ? 1 : null; (p.measures || []).forEach(function (m) { if (kgPerM == null && m.kg && m.qty) kgPerM = m.kg / m.qty; }); if (!kgPerM) return; perM = kgsM / kgPerM; multM = 1; whatM = Units.fmt(kgsM) + ' kg (≈' + Units.fmt(perM) + ' ' + Units.name(p.unit, perM) + ')'; }
            }
            var gM = Units.priceFor(p.price, perM) * multM;
            linesM.push('• **' + p.name + '**, ' + whatM + ': ' + naira(gM + Math.round(gM * f.feePct / 100) + delM) + ' in total');
          });
          if (linesM.length > 1) return R('Here is the total for each (goods + ' + f.feePct + '% service fee + delivery' + (stM ? ' to ' + stM.name : '') + '):\n' + linesM.join('\n') + (state ? '' : '\n(Assuming delivery in Ekiti. Tell me your state for the exact fee.)'), { chips: ['Delivery fees', 'How do I order?'] });
        }
        var per = 1, what = Units.qtyText(qty, p0.unit), mult = qty, haveTotal = true, waysText = '';
        var ways = (p0.measures || []).slice(0, 6).map(function (m) { return m.label + ' ' + naira(Units.priceFor(p0.price, m.qty)); }).join(', ');
        if (uw && uw !== p0.unit) {
          var cands = (p0.measures || []).filter(function (m) { return m.unit === uw; });
          if (cands.length === 1) { per = cands[0].qty; what = qty + ' × ' + cands[0].label; }
          else if (cands.length > 1) {
            return R('**' + p0.name + '** comes in more than one ' + Units.name(uw) + ' size. Which one do you want? ' + cands.map(function (m) { return m.label + ' ' + naira(Units.priceFor(p0.price, m.qty)); }).join(', ') + '.', { chips: ['Delivery fees', 'How do I order?'] });
          } else if (uw === 'kg' || uw === 'g' || uw === 'tonne') {
            var kgs = uw === 'g' ? qty / 1000 : uw === 'tonne' ? qty * 1000 : qty, kgPer = p0.unit === 'kg' ? 1 : null;
            (p0.measures || []).forEach(function (m) { if (kgPer == null && m.kg && m.qty) kgPer = m.kg / m.qty; });
            if (kgPer) { per = kgs / kgPer; mult = 1; what = Units.fmt(kgs) + ' kg (about ' + Units.fmt(per) + ' ' + Units.name(p0.unit, per) + ')'; }
            else haveTotal = false;
          } else haveTotal = false;
          if (!haveTotal) {
            return R('**' + p0.name + '** is sold per ' + Units.name(p0.unit) + ' (' + naira(p0.price) + ')' + (ways ? '. You can buy it by: ' + ways : '') + '. It is not sold by the ' + Units.name(uw) + '. Tell me how you would like to buy it and I will work out the total.', { chips: ['Delivery fees', 'How do I order?'] });
          }
        }
        var goods = Units.priceFor(p0.price, per) * mult, svc = Math.round(goods * f.feePct / 100);
        var st = state || f.states.filter(function (s) { return s.name === 'Ekiti'; })[0] || f.states[0];
        var del = st ? st.fee : 0;
        return R('For ' + what + ' of **' + p0.name + '**:\nGoods: ' + naira(goods) + '\nService fee (' + f.feePct + '%): ' + naira(svc) +
          '\nDelivery' + (st ? ' (' + st.name + ')' : '') + ': ' + naira(del) + '\n**Total: ' + naira(goods + svc + del) + '**' + (state ? '' : '\n(Assuming delivery in Ekiti. Tell me your state for the exact fee.)'),
          { chips: ['Delivery fees', 'How do I order?'] });
      }

      // ---- delivery to a place we do not serve
      var far = t.match(NG_PLACES);
      if (far && has(t, /\b(deliver|delivery|send|ship|reach|come|go)\b/) && !state) {
        return R('We do not deliver to ' + far[1].replace(/\b\w/g, function (c) { return c.toUpperCase(); }) + ' yet. We deliver in all 16 Ekiti LGAs and in ' + f.states.filter(function (s) { return s.name !== 'Ekiti'; }).map(function (s) { return s.name; }).join(', ') + '. Fees per order: ' + f.states.map(function (s) { return s.name + ' ' + naira(s.fee); }).join(', ') + '. If you have family or a pickup contact in one of those states, you can order to their address.', { chips: ['Delivery fees', 'Delivery time'] });
      }

      // ---- delivery
      if (has(t, /\b(deliver|delivery|shipping|ship|dispatch|send to|reach|do you (come|go) to)\b/) || (state && words(t).length <= 5)) {
        if (has(t, /\b(how long|time|days|when|hours|fast|quick|take)\b/)) return R(POLICY.deliveryTime, { chips: ['Delivery fees', 'How do I track my order?'] });
        if (state) {
          return R('Delivery to ' + state.name + ' costs ' + naira(state.fee) + ' per order (not per item), plus the ' + f.feePct + '% service fee on the goods. ' +
            (state.name === 'Ekiti' ? 'Ekiti deliveries are usually the quickest, about 24 hours. Choose your LGA at checkout.' : 'Type your town or LGA at checkout; we confirm the date on the confirmation call.'), { chips: ['Delivery time', 'How do I order?'] });
        }
        if (has(t, /\b(lga|local government)\b/)) return R(POLICY.lgas);
        return R('We deliver in all 16 Ekiti LGAs and in ' + f.states.filter(function (s) { return s.name !== 'Ekiti'; }).map(function (s) { return s.name; }).join(', ') + '. Delivery fees per order: ' + f.states.map(function (s) { return s.name + ' ' + naira(s.fee); }).join(', ') + '. Which state are you in? I will confirm your exact fee.', { chips: ['Delivery time', 'How do I order?'] });
      }
      if (has(t, /\b(lga|local government)\b/)) return R(POLICY.lgas);

      // ---- dishes
      var dish = Object.keys(DISHES).filter(function (d) { return t.indexOf(d) >= 0; }).sort(function (a, b) { return b.length - a.length; })[0];
      var cookQ = has(t, /\b(cook|make|prepare|recipe|ingredients?|soup|stew|what (do|can|should) i (buy|need|get)|for (a |my )?(party|home|family))\b/);
      if (dish || (cookQ && matched.length)) {
        var names = dish ? DISHES[dish] : matched.map(function (p) { return p.name; });
        var found = [];
        names.forEach(function (n) { findProducts(n, f).slice(0, 1).forEach(function (p) { if (found.indexOf(p) < 0) found.push(p); }); });
        if (found.length) {
          return R((dish ? 'For ' + dish + ' you can get these on Bouesti:\n' : 'Here is what goes well with that:\n') + found.map(function (p) { return '• ' + priceLine(p); }).join('\n') + '\nTell me quantities and your state and I will work out the total.', { chips: ['Delivery fees', 'How do I order?'] });
        }
      }

      // ---- comparing two or more things ("landrace vs large white")
      if (has(t, /\b(difference between|compare|versus|vs\.?|which is better|better than)\b/)) {
        var segs = t.replace(/\b(what is|what's|the|difference between|compare|which is better)\b/g, ' ').split(/\band\b|\bvs\.?\b|\bversus\b|\bor\b|\bthan\b|,/);
        var picked = [];
        segs.forEach(function (s) { var m1 = findProducts(s, f); if (m1.length && picked.indexOf(m1[0]) < 0) picked.push(m1[0]); });
        if (picked.length >= 2) {
          return R('Comparing:\n' + picked.slice(0, 3).map(function (p) { return '• ' + priceLine(p) + (noteFor(p) ? '\n   ' + noteFor(p) : ''); }).join('\n'), { chips: ['Delivery fees', 'How do I order?'] });
        }
      }

      // ---- livestock knowledge
      if (has(t, /\b(health cert|certificate|vaccinat|vet|healthy|disease)\b/)) return R(POLICY.protection + ' ' + LIVESTOCK_NOTES.health, { chips: ['What happens when livestock arrive?', 'Make a claim'] });
      if (has(t, /\b(arriv\w*|receiv\w*|take care|after delivery|first day|just got)\b/) && has(t, /\b(livestock|animal|pig|cow|cattle|chick|broiler|bird)\b/)) return R(LIVESTOCK_NOTES.arrival + ' ' + LIVESTOCK_NOTES.health);
      if (has(t, /\b(live (or|vs|versus) (processed|dressed)|processed|dressed|live weight)\b/)) return R(LIVESTOCK_NOTES.live, { chips: ['Broiler price', 'Delivery fees'] });
      if (has(t, /\b(difference between|compare|versus|vs\.?)\b/) && matched.length >= 2) {
        return R('Comparing:\n' + matched.slice(0, 3).map(function (p) { return '• ' + priceLine(p) + (noteFor(p) ? '\n   ' + noteFor(p) : ''); }).join('\n'));
      }

      // ---- superlatives / filters on the catalogue
      var under = t.match(/\b(under|below|less than|cheaper than|within)\s*₦?\s*(\d[\d,]*)/);
      if (under) {
        var cap = Number(under[2].replace(/,/g, ''));
        var cheap = (categoryPool(t, f) || f.products).filter(function (p) { return p.price <= cap && p.stock > 0; }).sort(function (a, b) { return a.price - b.price; });
        if (cheap.length) return R(listProducts(cheap, 'Items at or under ' + naira(cap) + ':', 8), { chips: ['What do you sell?'] });
        return R('I could not find in-stock items at or under ' + naira(cap) + '. The lowest prices start at ' + naira(Math.min.apply(null, f.products.map(function (p) { return p.price; }))) + '.');
      }
      if (has(t, /\b(cheapest|lowest price|most affordable|least expensive)\b/)) {
        var pool = matched.length ? matched : (categoryPool(t, f) || f.products);
        var sorted = pool.filter(function (p) { return p.stock > 0; }).sort(function (a, b) { return a.price - b.price; }).slice(0, 4);
        return R(listProducts(sorted, 'The most affordable' + (matched.length ? ' matches' : ' items') + ':', 4));
      }
      if (has(t, /\b(most expensive|highest price|premium|priciest)\b/)) {
        var big = (matched.length ? matched : (categoryPool(t, f) || f.products)).slice().sort(function (a, b) { return b.price - a.price; }).slice(0, 4);
        return R(listProducts(big, 'The highest-priced' + (matched.length ? ' matches' : ' items') + ':', 4));
      }
      if (has(t, /\b(low stock|almost (finished|gone|sold out)|running out|last (few|ones)|nearly out)\b/)) {
        var low = f.products.filter(function (p) { return p.stock > 0 && p.stock <= 5; });
        return R(low.length ? listProducts(low, 'Almost sold out:', 8) : 'Nothing is running very low right now.');
      }
      if (has(t, /\b(out of stock|sold out|unavailable|restock)\b/)) {
        var out = f.products.filter(function (p) { return p.stock <= 0; });
        return R(out.length ? listProducts(out, 'Out of stock right now:', 8) + '\nThey come back when the farmer restocks.' : 'Everything is in stock right now.');
      }

      // ---- a whole category ("what fish do you have", "show me spices")
      var onlyCat = categoryOnly(raw);
      if (onlyCat && !(onlyCat === 'livestock' && /\b(livestock|animals?)\b/.test(t)) && !(/\b(produce)\b/.test(t))) {
        var inCat = f.products.filter(function (p) { return p.sub === onlyCat; });
        if (inCat.length) {
          return R(SUB_LABELS[onlyCat] + ' (' + inCat.length + ' items):\n' + inCat.slice(0, 14).map(function (p) { return '• ' + priceLine(p); }).join('\n') + (inCat.length > 14 ? '\n…and ' + (inCat.length - 14) + ' more.' : '') +
            '\nOn the homepage use the "' + SUB_LABELS[onlyCat].split(',')[0] + '" filter button to see them all with pictures. Ask me about any item for uses and storage.', { chips: ['What do you sell?', 'Cheapest items', 'Delivery fees'] });
        }
      }

      var softCat = categoryKey(t);
      if (softCat && softCat !== 'livestock' && !matched.length && has(t, /\b(what|which|have|sell|available|show|list|offer|options|kinds|types)\b/)) {
        var inCat2 = f.products.filter(function (p) { return p.sub === softCat; });
        if (inCat2.length) return R(SUB_LABELS[softCat] + ' (' + inCat2.length + ' items):\n' + inCat2.slice(0, 14).map(function (p) { return '• ' + priceLine(p); }).join('\n') + (inCat2.length > 14 ? '\n…and ' + (inCat2.length - 14) + ' more.' : '') + '\nAsk me about any item for uses, storage and totals.', { chips: ['What do you sell?', 'Delivery fees'] });
      }

      // ---- selling ON bouesti (fallthrough protection) handled above; product questions:
      var wantsCatalog = has(t, /\b(what (do|can) you (sell|have|offer)|your products|catalog|catalogue|menu|categories|everything|all (items|products)|what.?s (on sale|available)|what is available|show (me )?(all|everything))\b/);
      var asksHow = has(t, /\b(store|storage|keep|last|use|used for|uses|good for|benefit|taste|hot|spicy|cook|prepare|tips?|what is|what.?s|tell me about|describe|difference)\b/);
      if (matched.length && !wantsCatalog) {
        if (matched.length === 1 || asksHow) {
          var p = matched[0], note = noteFor(p);
          var out2 = priceLine(p) + '.' + (p.desc ? ' ' + p.desc : '') + (note ? '\n' + note : '');
          if (matched.length > 1) out2 += '\n\nOther matches:\n' + matched.slice(1, 4).map(function (x) { return '• ' + priceLine(x); }).join('\n');
          return R(out2 + '\nTap the card to see it up close, pick your option and add it to your cart.', { chips: ['Delivery fees', 'How do I order?', 'Cheapest items'] });
        }
        return R('Here is what I found:\n' + matched.map(function (p) { return '• ' + priceLine(p); }).join('\n') + '\nTell me which one and how much you want, and I will work out the total.', { chips: ['Delivery fees'] });
      }
      if (has(t, /\b(livestock|farm animals?|animals?)\b/)) {
        return R('Our livestock section has three categories:\n' + sectionOverview(f, 'livestock') + '\nEvery livestock order comes with a vet health certificate. Tell me a category (for example "goats" or "fish") and I will list the prices.', { chips: ['Fish and aquaculture', 'Poultry products', 'Live or processed?', 'Health certificate'] });
      }
      if (has(t, /\bmeat\b/)) {
        var meats = f.products.filter(function (p) { return /pork|beef|goat meat|broiler|chicken parts|turkey/i.test(p.name); });
        return R(listProducts(meats, 'Meat options:', 10) + '\nFresh meat is kept chilled; cook within 2 days or freeze.', { chips: ['Livestock prices', 'Delivery fees'] });
      }
      if (has(t, /\b(produce|farm products?|soup ingredients)\b/)) {
        return R('Our farm produce is organised into seven categories:\n' + sectionOverview(f, 'produce') + '\nTell me a category (for example "grains" or "spices") or an item and I will give you prices, stock and tips.', { chips: ['What can I cook with yam?', 'Cheapest items', 'Delivery fees'] });
      }
      if (wantsCatalog) {
        var cats = {};
        f.products.forEach(function (p) { (cats[p.sub] = cats[p.sub] || []).push(p); });
        return R('Bouesti has ' + f.products.length + ' products in 10 categories:\n' + CATEGORY_ORDER.filter(function (k) { return cats[k]; }).map(function (k) {
          var prices = cats[k].map(function (p) { return p.price; });
          return '• ' + SUB_LABELS[k] + ' (' + cats[k].length + ' items, from ' + naira(Math.min.apply(null, prices)) + ')';
        }).join('\n') + '\nTell me a category or an item, e.g. "show me spices" or "tell me about ata rodo".', { chips: ['Fish and aquaculture', 'Grains and cereals', 'Cheapest items', 'What can I cook with yam?'] });
      }

      if (has(t, /\b(protein|high protein|body building|gym)\b/)) {
        var prot = f.products.filter(function (p) { return /egg|beans|soy|groundnut|catfish|tilapia|titus|croaker|beef|goat meat|pork|chicken|broiler|prawns|crayfish|stockfish|quail/i.test(p.name) && p.stock > 0; }).slice(0, 10);
        return R('Good protein sources on Bouesti:\n' + prot.map(function (p) { return '• ' + priceLine(p); }).join('\n') + '\nBeans, soybeans and groundnuts are the budget-friendly plant options; eggs, fish and chicken are quick animal proteins.', { chips: ['Cheapest items', 'Delivery fees'] });
      }

      // ---- policy topics
      var P = function (key, chips) { return R(POLICY[key], { chips: chips || [] }); };
      if (has(t, /\b(service fee|fees?|charges?|commission|hidden)\b/)) return R(POLICY.fees + ' The service fee is ' + f.feePct + '%.', { chips: ['Delivery fees', 'How can I pay?'] });
      if (has(t, /\b(pay|payment|paystack|card|bank transfer|transfer|pod|pay on delivery|cash|ussd)\b/)) return P('payment', ['Service fee', 'Delivery fees']);
      if (has(t, /\b(not covered|exclusions?|excluded)\b/)) return P('notCovered', ['What is covered?', 'Make a claim']);
      if (has(t, /\b(what is covered|covered|eligible)\b/)) return R(POLICY.covered + ' ' + POLICY.notCovered, { chips: ['Make a claim'] });
      if (has(t, /\b(claim|24 ?hours?|refund policy|return)\b/)) return R(GUIDES.claim, { chips: ['What is covered?', 'Log a complaint'] });
      if (has(t, /\b(insurance)\b/)) return P('insurance', ['Buyer protection', 'Make a claim']);
      if (has(t, /\b(protect|protection|guarantee|safe|secure|trust|legit|genuine|scam)\b/)) return R(POLICY.protection + '\n' + POLICY.covered, { chips: ['Make a claim', 'What is not covered?'] });
      if (has(t, /\b(what happens after|after i (complain|report|submit)|response time|how long.*(reply|respond|answer)|when will you (reply|respond))\b/)) {
        return R('After you submit a complaint you get a reference (CC-…). The team reviews it, checks with the farmer where needed and replies on the site; open "Track a complaint" in the Support section and enter your reference and phone/email to read the reply. The desk works Monday to Saturday, 7am–7pm, and messages outside those hours are answered by 8am the next morning.');
      }
      if (has(t, /\b(cancel|change (my )?order|edit (my )?order|modify|wrong address)\b/)) return P('cancel', ['Log a complaint', 'How do I track my order?']);
      if (has(t, /\b(2fa|two.?factor|two.?step|authenticator)\b/)) return P('twoFa');
      if (has(t, /\b(account|profile|email already|one email)\b/)) return R(POLICY.account + ' ' + POLICY.password, { chips: ['How do I log in?', 'Reset my password'] });
      if (has(t, /\b(bulk|wholesale|large quantit|many|party|event|restaurant|hotel|catering)\b/)) return P('bulk', ['Delivery fees', 'How do I order?']);
      if (has(t, /\b(weight|weights|pack size|packs?|how many kg|size options?)\b/)) return R(POLICY.priceRules, { chips: ['Live or processed?'] });
      if (has(t, /\b(stock|available|in stock|availability)\b/)) return P('stock');
      if (has(t, /\b(price|prices|pricing|how much)\b/) && !matched.length) return R(POLICY.priceRules + ' Tell me the item (for example "price of yam") and I will give you the exact price, or say "what do you sell" for the full list.', { chips: ['What do you sell?', 'Cheapest items'] });
      if (has(t, /\b(announcement|news|offer|promo|discount|coupon|sale|bargain|negotiate|cheaper)\b/)) {
        var a = f.announcements && f.announcements[0];
        return R('Prices are the ones shown on the product cards. ' + (a ? 'Latest announcement: ' + a.title + (a.message ? ' — ' + a.message : '') + '. ' : '') + POLICY.notifications + ' Buying more of an item is simply a matter of increasing the quantity in your cart.', { chips: ['What do you sell?', 'Cheapest items'] });
      }
      if (has(t, /\b(dark mode|light mode|theme|night mode|colour|color)\b/)) return P('theme');
      if (has(t, /\b(section|sections|page|pages|menu|navigation|navigate|website|site|what (is|are) (on|in) (the )?(site|website|page))\b/) && has(t, /\b(what|where|which|show|list|explain|tour|guide)\b/)) {
        return R(POLICY.sections + '\nPages: Track order (track.html), Receipt (receipt.html), Sell (sell.html), Buyer protection (buyer-protection.html) and Delivery areas (delivery-areas.html).', { chips: ['How do I order?', 'How do I track my order?'] });
      }
      if (has(t, /\b(about|bouesti|who (is|are)|company|ekiti|story|why (should|choose)|started|mission)\b/)) return R(POLICY.about + ' ' + POLICY.quality, { chips: ['What do you sell?', 'Delivery fees'] });
      if (has(t, /\b(fresh|quality|verified|organic|genuine|farm)\b/)) return P('quality', ['Buyer protection']);
      if (has(t, /\b(time|date|day)\b/) && has(t, /\b(deliver|arrive|come)\b/)) return P('deliveryTime');

      // ---- short follow-ups use the previous question for context
      if (words(t).length <= 5 && history && history.length && (/^(and|what about|how about|then|also|so|ok and|okay and)\b/.test(t) || findState(raw, f) || findProducts(raw, f).length)) {
        var prev = null;
        for (var h = history.length - 1; h >= 0; h--) { if (history[h].role === 'user') { prev = history[h]; break; } }
        if (prev && prev.body && prev.body !== raw) {
          var again = answer(prev.body + ' ' + raw, []);
          if (!again.fallback) return again;
        }
      }

      // ---- asked for something we do not stock
      if (!matched.length && has(t, /\b(do you (sell|have|stock|supply|deliver)|is there (any)?|are there (any)?|can i (get|buy)|i want|looking for)\b/) && !has(t, /\b(account|login|delivery|payment|refund|complaint|order|track)\b/)) {
        var cats2 = {};
        f.products.forEach(function (p) { cats2[p.sub] = 1; });
        return R('I do not see that on Bouesti right now. We sell: ' + Object.keys(cats2).map(function (k) { return SUB_LABELS[k] || k; }).join(', ') + '. Ask me about any of these (for example "price of yam"), or tell me what you are cooking and I will suggest items. Stock changes as farmers restock, so check back soon.', { chips: ['What do you sell?', 'Cheapest items'] });
      }

      // ---- last resort: best-matching knowledge passage (so we still teach instead of just referring away)
      var best = bestPassage(raw, f);
      if (best) return R(best, { chips: ['What do you sell?', 'How do I order?', 'Log a complaint'] });

      return R('I want to get this right, and I am not certain what you are asking. I can help with: product prices, stock, storage and uses; delivery fees and times; ordering, tracking, receipts and accounts; buyer protection, claims and complaints; and selling on Bouesti. Could you rephrase, or pick one of these? If it is something outside the website, the desk is on WhatsApp (' + f.phone + ': ' + wa + '), ' + POLICY.hours,
        { fallback: true, chips: ['What do you sell?', 'How do I track my order?', 'Delivery fees', 'Log a complaint'] });
    }

    // Bag-of-words search over every guide and policy paragraph
    function bestPassage(raw, f) {
      var q = words(raw).map(function (w) { return SYN[w] || w; }).map(stem).filter(function (w) { return w.length >= 3 && !STOP[w]; });
      if (!q.length) return null;
      var docs = [];
      Object.keys(GUIDES).forEach(function (k) { docs.push({ k: 'guide:' + k, text: GUIDES[k] }); });
      Object.keys(POLICY).forEach(function (k) { docs.push({ k: 'policy:' + k, text: POLICY[k] }); });
      var bestDoc = null, bestScore = 0;
      docs.forEach(function (d) {
        var tokens = words(d.text).map(stem), score = 0;
        q.forEach(function (w) { var c = tokens.filter(function (x) { return x === w; }).length; if (c) score += 1 + Math.min(c, 3) * 0.3; });
        if (q.length >= 2 && score / q.length > 0.6) score += 1;
        if (score > bestScore) { bestScore = score; bestDoc = d; }
      });
      if (!bestDoc || bestScore < 2) return null;
      return bestDoc.text;
    }

    return { answer: answer, complaintCategory: complaintCategory, facts: getFacts, knowledgeText: function () { return knowledgeText(getFacts()); } };
  }

  return { createEngine: createEngine, knowledgeText: knowledgeText, CATEGORIES: CATEGORIES, POLICY: POLICY, GUIDES: GUIDES, SUB_LABELS: SUB_LABELS, naira: naira };
});
