import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Search, ShoppingBag, User, Menu, X, ChevronDown, ChevronRight,
  Truck, ShieldCheck, Headphones, PackageCheck, Star, ArrowRight,
  Minus, Plus, Trash2, Play, Bitcoin, Instagram, Youtube
} from "lucide-react";
import "./styles.css";

const products = [
  { id: 1, name: "Bitaxe Gamma Home Miner + Power Supply", price: 119.99, old: null, tag: "BEST SELLER", kind: "bitaxe", reviews: 45, section: "Bitaxe Miners" },
  { id: 2, name: "NerdOcta 9–12TH/s BTC Miner", price: 399.99, old: 449.99, tag: "SAVE $50", kind: "octa", reviews: 18, section: "Bitaxe Miners" },
  { id: 3, name: "Qaxe++ 4.8–6TH/s Multi-Chip Miner", price: 249.99, old: 299.99, tag: "POPULAR", kind: "qaxe", reviews: 31, section: "Bitaxe Miners" },
  { id: 4, name: "Gamma++ 2TH/s Home Miner", price: 129.99, old: null, tag: "NEW", kind: "gamma", reviews: 12, section: "Bitaxe Miners" },
  { id: 5, name: "Mars Lander 3 All-In-One Lottery Miner", price: 749.99, old: null, tag: "NEW", kind: "lander", reviews: 26, section: "Lucky Miners" },
  { id: 6, name: "Gold Nugget Lottery Miner", price: 39.99, old: null, tag: "START HERE", kind: "gold", reviews: 11, section: "Lucky Miners" },
  { id: 7, name: "USB Lottery Miner", price: 29.99, old: null, tag: "BEST VALUE", kind: "usb", reviews: 77, section: "Lucky Miners" },
  { id: 8, name: "DOGE Driller 330MH/s Scrypt Miner", price: 499.99, old: 549.99, tag: "SAVE $50", kind: "doge", reviews: 21, section: "Lucky Miners" },
  { id: 9, name: "Avalon Q 90TH/s BTC Miner", price: 1794.99, old: 1899.99, tag: "PRO", kind: "avalon", reviews: 8, section: "Premium Hardware" },
  { id: 10, name: "Avalon Mini 37.5TH/s Miner + Heater", price: 1149.99, old: null, tag: "HOME PRO", kind: "mini", reviews: 16, section: "Premium Hardware" },
  { id: 11, name: "X Node Mini 2TB Full Bitcoin Node", price: 799.99, old: null, tag: "NODE", kind: "node", reviews: 14, section: "Premium Hardware" },
  { id: 12, name: "Nano 3S 6TH/s Miner + Power Supply", price: 299.99, old: 329.99, tag: "SAVE $30", kind: "nano", reviews: 42, section: "Premium Hardware" },
  { id: 13, name: "Titan Mini Cold Wallet", price: 124.99, old: null, tag: "SECURE", kind: "wallet", reviews: 29, section: "Wallets" },
  { id: 14, name: "Vault X Hardware Wallet", price: 199.99, old: 219.99, tag: "PREMIUM", kind: "wallet2", reviews: 61, section: "Wallets" },
  { id: 15, name: "Metal Seed Backup Plate", price: 79.99, old: null, tag: "FIREPROOF", kind: "seed", reviews: 37, section: "Wallets" },
  { id: 16, name: "Bitcoin Starter Bundle", price: 149.99, old: 179.99, tag: "BUNDLE", kind: "bundle", reviews: 24, section: "Wallets" }
];

const sectionData = [
  { title: "BITAXE MINERS", subtitle: "Quiet, efficient home miners made for learning, stacking sats and joining the network.", section: "Bitaxe Miners" },
  { title: "LUCKY MINERS", subtitle: "Compact lottery miners built for Bitcoin enthusiasts who want to solo mine at home.", section: "Lucky Miners" },
  { title: "PREMIUM MINING HARDWARE", subtitle: "Serious hashpower for advanced home labs and professional mining setups.", section: "Premium Hardware" },
  { title: "HARDWARE WALLETS", subtitle: "Keep your bitcoin keys offline with purpose-built cold storage.", section: "Wallets" }
];

function money(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function ProductVisual({ kind }) {
  return (
    <div className={`product-visual visual-${kind}`}>
      <div className="device-shadow" />
      <div className="device">
        <div className="device-top"><span /><span /><span /></div>
        <div className="fan"><div className="fan-core" /></div>
        <div className="screen"><Bitcoin size={21} /> <b>BITC</b></div>
        <div className="ports"><i /><i /><i /></div>
      </div>
      <div className="hash-pill">SHA-256</div>
    </div>
  );
}

function Stars({ reviews }) {
  return (
    <div className="rating" aria-label={`5 stars, ${reviews} reviews`}>
      <span className="stars">{Array.from({ length: 5 }).map((_, i) => <Star key={i} size={13} fill="currentColor" />)}</span>
      <span>{reviews} reviews</span>
    </div>
  );
}

function ProductCard({ product, onAdd }) {
  return (
    <article className="product-card">
      <div className="product-media">
        <span className="product-tag">{product.tag}</span>
        <button className="quick-view">Quick view</button>
        <ProductVisual kind={product.kind} />
      </div>
      <div className="product-info">
        <Stars reviews={product.reviews} />
        <h3>{product.name}</h3>
        <div className="price-row">
          <strong>{money(product.price)}</strong>
          {product.old && <del>{money(product.old)}</del>}
        </div>
        <button className="add-btn" onClick={() => onAdd(product)}>ADD TO CART</button>
      </div>
    </article>
  );
}

function CartDrawer({ open, onClose, cart, setCart }) {
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const changeQty = (id, delta) => {
    setCart(items => items.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i));
  };
  const remove = (id) => setCart(items => items.filter(i => i.id !== id));

  return (
    <>
      <div className={`drawer-backdrop ${open ? "show" : ""}`} onClick={onClose} />
      <aside className={`cart-drawer ${open ? "open" : ""}`} aria-hidden={!open}>
        <div className="drawer-head">
          <div>
            <p>YOUR CART</p>
            <h3>{cart.length ? `${cart.reduce((a,b)=>a+b.qty,0)} item(s)` : "Your cart is empty"}</h3>
          </div>
          <button onClick={onClose} className="icon-btn"><X /></button>
        </div>
        <div className="free-ship">
          <Truck size={18} />
          {total >= 150 ? <b>You unlocked free shipping.</b> : <span>Add <b>{money(Math.max(0, 150-total))}</b> for free U.S. shipping.</span>}
        </div>
        <div className="cart-items">
          {!cart.length && (
            <div className="empty-cart">
              <ShoppingBag size={44} />
              <p>No products in your cart yet.</p>
              <button className="primary-btn" onClick={onClose}>SHOP PRODUCTS</button>
            </div>
          )}
          {cart.map(item => (
            <div className="cart-line" key={item.id}>
              <div className="cart-thumb"><ProductVisual kind={item.kind} /></div>
              <div className="cart-line-info">
                <h4>{item.name}</h4>
                <strong>{money(item.price)}</strong>
                <div className="qty-row">
                  <div className="qty">
                    <button onClick={() => changeQty(item.id, -1)}><Minus size={14}/></button>
                    <span>{item.qty}</span>
                    <button onClick={() => changeQty(item.id, 1)}><Plus size={14}/></button>
                  </div>
                  <button className="trash" onClick={() => remove(item.id)}><Trash2 size={16}/></button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {!!cart.length && (
          <div className="drawer-footer">
            <div className="subtotal"><span>Subtotal</span><strong>{money(total)}</strong></div>
            <p>Taxes and shipping calculated at checkout.</p>
            <button className="checkout-btn">CHECKOUT SECURELY</button>
            <button className="continue-btn" onClick={onClose}>Continue shopping</button>
          </div>
        )}
      </aside>
    </>
  );
}

function Header({ cartCount, onCart }) {
  const [mobile, setMobile] = useState(false);
  return (
    <>
      <div className="announcement">₿ JOIN THE HASH CLUB — MEMBER PRICING, EARLY DROPS & MONTHLY GIVEAWAYS <ChevronRight size={16}/></div>
      <div className="utility">
        <span>Need help? <b>support@bitcmining.com</b></span>
        <div><span>Fast U.S. shipping</span><span>•</span><span>Secure checkout</span></div>
      </div>
      <header className="header">
        <button className="mobile-menu" onClick={() => setMobile(true)}><Menu /></button>
        <a className="logo" href="#">
          <span className="logo-mark"><Bitcoin size={28}/></span>
          <span><b>BITC</b><small>MINING</small></span>
        </a>
        <div className="search-box"><Search size={20}/><input placeholder="Search miners, wallets, accessories..." /><button>SEARCH</button></div>
        <div className="header-actions">
          <button className="account-btn"><User size={22}/><span>Account</span></button>
          <button className="cart-btn" onClick={onCart}><ShoppingBag size={23}/><span>Cart</span><em>{cartCount}</em></button>
        </div>
      </header>
      <nav className="nav">
        <a href="#lucky">Lucky Miners</a>
        <a href="#bitaxe">Bitaxe Miners</a>
        <a href="#premium">Mining Hardware</a>
        <a href="#wallets">Wallets</a>
        <a href="#accessories">Accessories</a>
        <a href="#guides">Video Guides</a>
        <a href="#reviews">Reviews</a>
        <a href="#support">Support</a>
      </nav>

      <div className={`mobile-panel ${mobile ? "open" : ""}`}>
        <div className="mobile-panel-head"><span className="logo"><span className="logo-mark"><Bitcoin size={24}/></span><b>BITC</b></span><button className="icon-btn" onClick={() => setMobile(false)}><X/></button></div>
        {["Lucky Miners","Bitaxe Miners","Mining Hardware","Wallets","Accessories","Video Guides","Reviews","Support"].map(x => <a key={x} href="#" onClick={() => setMobile(false)}>{x}<ChevronRight size={18}/></a>)}
      </div>
    </>
  );
}

function Hero() {
  return (
    <section className="hero">
      <div className="hero-copy">
        <span className="eyebrow">HOME MINING, WITHOUT THE GUESSWORK</span>
        <h1>Own your hash.<br/><em>Mine your future.</em></h1>
        <p>Purpose-built Bitcoin mining hardware for curious beginners, home miners and serious operators.</p>
        <div className="hero-actions">
          <a href="#bitaxe" className="primary-btn">SHOP MINERS <ArrowRight size={18}/></a>
          <a href="#guides" className="secondary-btn"><Play size={17} fill="currentColor"/> WATCH GUIDE</a>
        </div>
        <div className="hero-proof">
          <div className="avatars"><i>A</i><i>M</i><i>J</i><i>K</i></div>
          <div><div className="proof-stars">★★★★★</div><span>Loved by 12,000+ mining customers</span></div>
        </div>
      </div>
      <div className="hero-art">
        <div className="orange-orbit orbit-one"/><div className="orange-orbit orbit-two"/>
        <div className="hero-device hero-device-main"><ProductVisual kind="hero"/></div>
        <div className="hero-card stat-one"><span>NETWORK</span><strong>ONLINE</strong><small>Stable connection</small></div>
        <div className="hero-card stat-two"><span>EFFICIENCY</span><strong>17.5 J/TH</strong><small>Optimized home setup</small></div>
        <div className="btc-float"><Bitcoin size={36}/></div>
      </div>
    </section>
  );
}

function TrustStrip() {
  const items = [
    [ShieldCheck, "Trusted hardware", "Carefully selected & tested"],
    [Truck, "Fast shipping", "Tracked U.S. fulfillment"],
    [PackageCheck, "Ready to mine", "Beginner-friendly setups"],
    [Headphones, "Real support", "Helpful pre & post-sale support"]
  ];
  return <section className="trust-strip">{items.map(([Icon,t,s]) => <div key={t}><span><Icon/></span><p><b>{t}</b><small>{s}</small></p></div>)}</section>;
}

function ProductSection({ data, onAdd, id }) {
  const sectionProducts = products.filter(p => p.section === data.section);
  return (
    <section className="products-section" id={id}>
      <div className="section-head">
        <div><span className="mini-kicker">SHOP BITC</span><h2>{data.title}</h2><p>{data.subtitle}</p></div>
        <a href="#">VIEW ALL <ArrowRight size={17}/></a>
      </div>
      <div className="product-grid">{sectionProducts.map(p => <ProductCard key={p.id} product={p} onAdd={onAdd}/>)}</div>
    </section>
  );
}

function PromoBands() {
  return (
    <section className="promo-grid">
      <article className="promo-card dark">
        <div className="promo-copy"><span>START SMALL</span><h3>Bitcoin lottery miners</h3><p>Plug in, connect and start hashing from your desk.</p><a href="#lucky">SHOP LUCKY MINERS <ArrowRight size={17}/></a></div>
        <div className="promo-device"><ProductVisual kind="gold"/></div>
      </article>
      <article className="promo-card orange">
        <div className="promo-copy"><span>LEARN & SCALE</span><h3>Home mining made simple</h3><p>Guides, tested hardware and support for every stage.</p><a href="#guides">WATCH THE GUIDES <ArrowRight size={17}/></a></div>
        <div className="big-btc"><Bitcoin/></div>
      </article>
    </section>
  );
}

function WhyUs() {
  return (
    <section className="why" id="reviews">
      <div className="why-media">
        <div className="warehouse">
          <div className="shelf s1"/><div className="shelf s2"/><div className="shelf s3"/>
          <div className="warehouse-badge"><PackageCheck/><span><b>READY TO SHIP</b><small>Quality checked before dispatch</small></span></div>
        </div>
      </div>
      <div className="why-copy">
        <span className="mini-kicker">BUILT FOR BITCOINERS</span>
        <h2>Hardware you can actually understand.</h2>
        <p>Mining can feel complicated. Our goal is to make the first setup straightforward and the next upgrade obvious.</p>
        <ul>
          <li><ShieldCheck/><span><b>Curated hardware</b><small>Products selected around reliability, thermals and ease of use.</small></span></li>
          <li><Headphones/><span><b>Human support</b><small>Help choosing hardware and getting your miner online.</small></span></li>
          <li><Truck/><span><b>Transparent fulfillment</b><small>Clear expectations, tracking and no mystery logistics.</small></span></li>
        </ul>
        <a className="primary-btn" href="#bitaxe">FIND YOUR MINER <ArrowRight size={18}/></a>
      </div>
    </section>
  );
}

function Newsletter() {
  return (
    <section className="newsletter">
      <div><span className="mini-kicker">THE BITC SIGNAL</span><h2>Get mining drops before everyone else.</h2><p>New hardware, setup guides, bundle pricing and occasional giveaways.</p></div>
      <form onSubmit={e => e.preventDefault()}><input type="email" placeholder="Enter your email address"/><button>JOIN THE LIST</button></form>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer" id="support">
      <div className="footer-top">
        <div className="footer-brand">
          <a className="logo inverted" href="#"><span className="logo-mark"><Bitcoin size={28}/></span><span><b>BITC</b><small>MINING</small></span></a>
          <p>Mining hardware and Bitcoin gear for people who want to participate in the network, not just watch it.</p>
          <div className="socials"><button><Instagram/></button><button><Youtube/></button><button><span>𝕏</span></button></div>
        </div>
        <div><h4>SHOP</h4><a>Lucky Miners</a><a>Bitaxe Miners</a><a>ASIC Miners</a><a>Wallets</a><a>Accessories</a></div>
        <div><h4>HELP</h4><a>Shipping</a><a>Returns</a><a>FAQ</a><a>Setup Guides</a><a>Contact</a></div>
        <div><h4>COMPANY</h4><a>About BITC</a><a>Reviews</a><a>Privacy Policy</a><a>Terms of Service</a><a>Warranty</a></div>
      </div>
      <div className="footer-bottom"><span>© 2026 BITC Mining. All rights reserved.</span><div><span>VISA</span><span>MC</span><span>AMEX</span><span>₿ BTC</span></div></div>
    </footer>
  );
}

function App() {
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const count = useMemo(() => cart.reduce((a,b) => a+b.qty, 0), [cart]);

  const add = product => {
    setCart(items => {
      const found = items.find(i => i.id === product.id);
      return found ? items.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i) : [...items, { ...product, qty: 1 }];
    });
    setCartOpen(true);
  };

  return (
    <>
      <Header cartCount={count} onCart={() => setCartOpen(true)} />
      <main>
        <Hero/>
        <TrustStrip/>
        <div className="ticker"><div>BITCOIN HARDWARE <Bitcoin size={15}/> HOME MINING <Bitcoin size={15}/> COLD STORAGE <Bitcoin size={15}/> ASIC MINERS <Bitcoin size={15}/> BITCOIN HARDWARE <Bitcoin size={15}/> HOME MINING <Bitcoin size={15}/> COLD STORAGE</div></div>
        <ProductSection data={sectionData[0]} onAdd={add} id="bitaxe"/>
        <PromoBands/>
        <ProductSection data={sectionData[1]} onAdd={add} id="lucky"/>
        <WhyUs/>
        <ProductSection data={sectionData[2]} onAdd={add} id="premium"/>
        <section className="video-band" id="guides"><div><span className="mini-kicker">VIDEO GUIDES</span><h2>From unboxing to your first share.</h2><p>Clear setup walkthroughs designed for first-time home miners.</p><button className="secondary-btn light"><Play fill="currentColor"/> WATCH SETUP VIDEOS</button></div><div className="video-mock"><button><Play size={32} fill="currentColor"/></button><span>BITC MINING / GETTING STARTED</span></div></section>
        <ProductSection data={sectionData[3]} onAdd={add} id="wallets"/>
        <Newsletter/>
      </main>
      <Footer/>
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} cart={cart} setCart={setCart}/>
    </>
  );
}

createRoot(document.getElementById("root")).render(<App/>);
