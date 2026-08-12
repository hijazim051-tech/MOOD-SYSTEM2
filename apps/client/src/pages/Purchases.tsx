import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";
import { getBranchStock } from "../lib/branchStock";

type Supplier = { id:string; name:string; phone:string };
type ProductDetail = { id:number; name:string; stock:number; buyPrice:number; sellPrice:number };
type Product = { id:number; name:string; categoryId:string; categoryName:string; details:ProductDetail[] };
type Category = { id:string; name:string };
type DraftItem = { localId:string; productDetailId:number; productName:string; detailName:string; quantity:number; unitPurchasePrice:number; unitSellPrice:number; notes:string };
type Invoice = { id:string; supplierName:string; invoiceNo:string; invoiceDate:string; purchaseMode:string; grandTotal:number; paidAmount:number; remainingAmount:number; paymentMethod:string; deliveryCost:number; otherCosts:number; notes:string };

const input="w-full rounded-xl border border-gray-200 bg-white p-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

export default function Purchases(){
 const {effectiveBranchId,selectedBranch}=useBranch();
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [suppliers,setSuppliers]=useState<Supplier[]>([]),[products,setProducts]=useState<Product[]>([]),[categories,setCategories]=useState<Category[]>([]),[invoices,setInvoices]=useState<Invoice[]>([]);
 const [supplierId,setSupplierId]=useState(""),[supplierSearch,setSupplierSearch]=useState("");
 const [invoiceNo,setInvoiceNo]=useState(""),[invoiceDate,setInvoiceDate]=useState(today());
 const [purchaseMode,setPurchaseMode]=useState<"cash"|"credit"|"mixed">("cash"),[paymentMethod,setPaymentMethod]=useState<"cash"|"bank_transfer">("cash"),[paidAmount,setPaidAmount]=useState("");
 const [deliveryCost,setDeliveryCost]=useState(""),[otherCosts,setOtherCosts]=useState(""),[invoiceNotes,setInvoiceNotes]=useState("");
 const [search,setSearch]=useState(""),[selectedDetailId,setSelectedDetailId]=useState(""),[qty,setQty]=useState("1"),[buy,setBuy]=useState(""),[sell,setSell]=useState(""),[itemNotes,setItemNotes]=useState("");
 const [items,setItems]=useState<DraftItem[]>([]),[editingInvoiceId,setEditingInvoiceId]=useState<string|null>(null);
 const [showNewProduct,setShowNewProduct]=useState(false),[newCategoryId,setNewCategoryId]=useState(""),[newProductName,setNewProductName]=useState(""),[newDetailName,setNewDetailName]=useState(""),[newBuy,setNewBuy]=useState(""),[newSell,setNewSell]=useState("");
 const [showNewSupplier,setShowNewSupplier]=useState(false),[newSupplierName,setNewSupplierName]=useState(""),[newSupplierPhone,setNewSupplierPhone]=useState("");

 useEffect(()=>{void load()},[effectiveBranchId]);
 const selectedSupplier=useMemo(()=>suppliers.find(x=>x.id===supplierId),[suppliers,supplierId]);
 const supplierResults=useMemo(()=>{const q=supplierSearch.trim().toLowerCase();return suppliers.filter(x=>!q||x.name.toLowerCase().includes(q)||x.phone.includes(q)).slice(0,8)},[suppliers,supplierSearch]);
 const flatDetails=useMemo(()=>products.flatMap(p=>p.details.map(d=>({...d,productId:p.id,productName:p.name,categoryName:p.categoryName}))),[products]);
 const productResults=useMemo(()=>{const q=search.trim().toLowerCase();return flatDetails.filter(x=>!q||`${x.productName} ${x.name} ${x.categoryName}`.toLowerCase().includes(q)).slice(0,50)},[flatDetails,search]);
 const selectedDetail=useMemo(()=>flatDetails.find(x=>String(x.id)===selectedDetailId),[flatDetails,selectedDetailId]);
 const subtotal=useMemo(()=>items.reduce((s,x)=>s+x.quantity*x.unitPurchasePrice,0),[items]);
 const total=subtotal+Number(deliveryCost||0)+Number(otherCosts||0);
 const paid=purchaseMode==="credit"?0:purchaseMode==="cash"?total:Number(paidAmount||0);
 const remaining=Math.max(total-paid,0);

 useEffect(()=>{if(selectedDetail){setBuy(selectedDetail.buyPrice?String(selectedDetail.buyPrice):"");setSell(selectedDetail.sellPrice?String(selectedDetail.sellPrice):"")}},[selectedDetailId]);
 useEffect(()=>{if(purchaseMode==="cash")setPaidAmount(String(total||""));if(purchaseMode==="credit")setPaidAmount("")},[purchaseMode,total]);

 async function load(){setLoading(true);try{
   const [s,c,p,i,stock]=await Promise.all([
    supabase.from("suppliers").select("id,name,phone,branch_id").eq("is_active",true).order("name"),
    supabase.from("categories").select("id,name").order("id"),
    supabase.from("products").select("id,name,category_id,product_details(id,name,buy_price,sell_price,unit_sell_price)").order("name"),
    supabase.from("purchase_invoices").select("id,supplier_name_snapshot,invoice_no,invoice_date,purchase_mode,grand_total,paid_amount,remaining_amount,payment_method,delivery_cost,other_costs,notes,branch_id").order("invoice_date",{ascending:false}).order("created_at",{ascending:false}).limit(60),
    getBranchStock(effectiveBranchId)
   ]);
   if(s.error)throw s.error;if(c.error)throw c.error;if(p.error)throw p.error;if(i.error)throw i.error;
   const stockMap=new Map(stock.map(x=>[x.productDetailId,x.stock]));
   setSuppliers((s.data||[]).filter((x:any)=>!effectiveBranchId||String(x.branch_id||"")===effectiveBranchId).map((x:any)=>({id:String(x.id),name:String(x.name||""),phone:String(x.phone||"")})));
   const cats=(c.data||[]).map((x:any)=>({id:String(x.id),name:String(x.name||"")}));setCategories(cats);
   const catMap=new Map(cats.map(x=>[x.id,x.name]));
   setProducts((p.data||[]).filter((x:any)=>Number(x.category_id)!==86).map((x:any)=>({id:Number(x.id),name:String(x.name||""),categoryId:String(x.category_id||""),categoryName:catMap.get(String(x.category_id||""))||"",details:(x.product_details||[]).map((d:any)=>({id:Number(d.id),name:String(d.name||""),stock:Number(stockMap.get(Number(d.id))||0),buyPrice:Number(d.buy_price||0),sellPrice:Number(d.unit_sell_price||d.sell_price||0)}))})));
   setInvoices((i.data||[]).filter((x:any)=>!effectiveBranchId||String(x.branch_id||"")===effectiveBranchId).map((x:any)=>({id:String(x.id),supplierName:String(x.supplier_name_snapshot||""),invoiceNo:String(x.invoice_no||""),invoiceDate:String(x.invoice_date||""),purchaseMode:String(x.purchase_mode||"cash"),grandTotal:Number(x.grand_total||0),paidAmount:Number(x.paid_amount||0),remainingAmount:Number(x.remaining_amount||0),paymentMethod:String(x.payment_method||"cash"),deliveryCost:Number(x.delivery_cost||0),otherCosts:Number(x.other_costs||0),notes:String(x.notes||"")})));
 }catch(e){alert(msg(e))}finally{setLoading(false)}}

 function addItem(){if(!selectedDetail)return alert("اختار منتج");const q=Number(qty),b=Number(buy),s=Number(sell);if(q<=0||b<=0)return alert("راجع الكمية وسعر الشراء");if(s<=0)return alert("اكتب سعر البيع");setItems(v=>[...v,{localId:crypto.randomUUID(),productDetailId:selectedDetail.id,productName:selectedDetail.productName,detailName:selectedDetail.name,quantity:q,unitPurchasePrice:b,unitSellPrice:s,notes:itemNotes.trim()}]);setSelectedDetailId("");setSearch("");setQty("1");setBuy("");setSell("");setItemNotes("")}

 async function createProduct(){if(!effectiveBranchId)return alert("اختر فرع");if(!newCategoryId||!newProductName.trim()||!newDetailName.trim())return alert("القسم واسم المنتج والتفصيل مطلوبين");try{
  const {data:prod,error:pe}=await supabase.from("products").insert({category_id:Number(newCategoryId),name:newProductName.trim(),icon:"📦",product_type:"normal",has_recipe:false}).select("id").single();if(pe)throw pe;
  const {data:det,error:de}=await supabase.from("product_details").insert({product_id:prod.id,name:newDetailName.trim(),buy_price:Number(newBuy||0),sell_price:Number(newSell||0),unit_sell_price:Number(newSell||0),average_unit_cost:0,alert_limit:0,is_important:false}).select("id").single();if(de)throw de;
  await supabase.from("branch_product_stock").upsert({branch_id:effectiveBranchId,product_detail_id:det.id,stock:0,average_unit_cost:0,updated_at:new Date().toISOString()},{onConflict:"branch_id,product_detail_id"});
  setShowNewProduct(false);setNewProductName("");setNewDetailName("");setNewBuy("");setNewSell("");await load();setSelectedDetailId(String(det.id));alert("تم إنشاء المنتج واختياره ✅");
 }catch(e){alert(msg(e))}}

 async function createSupplier(){if(!effectiveBranchId)return alert("اختر فرع");if(!newSupplierName.trim())return alert("اسم المورد مطلوب");try{const {data,error}=await supabase.from("suppliers").insert({name:newSupplierName.trim(),phone:newSupplierPhone.trim(),supplier_type:"عام",is_active:true,branch_id:effectiveBranchId}).select("id,name,phone").single();if(error)throw error;setShowNewSupplier(false);setNewSupplierName("");setNewSupplierPhone("");await load();setSupplierId(String(data.id));setSupplierSearch(String(data.name));}catch(e){alert(msg(e))}}

 async function save(){if(!effectiveBranchId)return alert("اختر فرع محدد");if(!selectedSupplier)return alert("اختر المورد");if(items.length===0)return alert("أضف منتج واحد على الأقل");if(paid<0||paid>total)return alert("قيمة المدفوع غير صحيحة");setSaving(true);try{
   const payload=items.map(x=>({itemKind:"product_detail",productDetailId:x.productDetailId,usagePriceTierId:null,productName:x.productName,detailName:x.detailName,quantity:x.quantity,unitPurchasePrice:x.unitPurchasePrice,unitSellPrice:x.unitSellPrice,notes:x.notes}));
   const fn=editingInvoiceId?"update_purchase_invoice":"save_purchase_invoice";
   const args:any={p_branch_id:effectiveBranchId,p_supplier_id:selectedSupplier.id,p_supplier_name:selectedSupplier.name,p_invoice_no:invoiceNo.trim(),p_invoice_date:invoiceDate,p_purchase_mode:purchaseMode,p_delivery_cost:Number(deliveryCost||0),p_other_costs:Number(otherCosts||0),p_paid_amount:paid,p_payment_method:paymentMethod,p_notes:invoiceNotes.trim(),p_items:payload};
   if(editingInvoiceId)args.p_invoice_id=editingInvoiceId;
   const {error}=await supabase.rpc(fn,args);if(error)throw error;
   for(const x of items){const {error:e}=await supabase.from("product_details").update({buy_price:x.unitPurchasePrice,sell_price:x.unitSellPrice,unit_sell_price:x.unitSellPrice}).eq("id",x.productDetailId);if(e)throw e}
   reset();await load();alert(editingInvoiceId?"تم تعديل الفاتورة والمخزون ✅":"تم حفظ الفاتورة والمخزون ✅");
 }catch(e){alert(msg(e))}finally{setSaving(false)}}

 async function editInvoice(inv:Invoice){try{const {data,error}=await supabase.from("purchase_invoice_items").select("product_detail_id,item_name_snapshot,detail_name_snapshot,quantity,unit_purchase_price,notes").eq("purchase_invoice_id",inv.id);if(error)throw error;setEditingInvoiceId(inv.id);const sup=suppliers.find(x=>x.name===inv.supplierName);setSupplierId(sup?.id||"");setSupplierSearch(inv.supplierName);setInvoiceNo(inv.invoiceNo);setInvoiceDate(inv.invoiceDate);setPurchaseMode((inv.purchaseMode==="credit"||inv.purchaseMode==="mixed")?inv.purchaseMode:"cash");setPaymentMethod(inv.paymentMethod.includes("bank")?"bank_transfer":"cash");setPaidAmount(String(inv.paidAmount));setDeliveryCost(String(inv.deliveryCost||""));setOtherCosts(String(inv.otherCosts||""));setInvoiceNotes(inv.notes||"");setItems((data||[]).filter((x:any)=>x.product_detail_id).map((x:any)=>({localId:crypto.randomUUID(),productDetailId:Number(x.product_detail_id),productName:String(x.item_name_snapshot||""),detailName:String(x.detail_name_snapshot||""),quantity:Number(x.quantity||0),unitPurchasePrice:Number(x.unit_purchase_price||0),unitSellPrice:Number(flatDetails.find(d=>d.id===Number(x.product_detail_id))?.sellPrice||0),notes:String(x.notes||"")})));window.scrollTo({top:0,behavior:"smooth"});}catch(e){alert(msg(e))}}

 function reset(){setEditingInvoiceId(null);setSupplierId("");setSupplierSearch("");setInvoiceNo("");setInvoiceDate(today());setPurchaseMode("cash");setPaymentMethod("cash");setPaidAmount("");setDeliveryCost("");setOtherCosts("");setInvoiceNotes("");setItems([]);setSearch("");setSelectedDetailId("")}

 if(loading)return <div className="p-8 text-xl font-black">جاري تحميل المشتريات...</div>;
 return <div dir="rtl" className="space-y-6 p-4 md:p-8">
  <header><h1 className="text-3xl font-black">💰 المشتريات</h1><p className="mt-2 font-bold text-emerald-700">الفرع: {selectedBranch?.name||"كل الفروع"}</p><p className="mt-1 text-gray-500">واجهة سريعة: اختار المورد، ابحث عن المنتج، أدخل الكمية والسعر واحفظ.</p></header>
  {editingInvoiceId&&<div className="rounded-xl bg-amber-100 p-4 font-black text-amber-900">✏️ أنت تعدل فاتورة موجودة. عند الحفظ سيُعاد حساب المخزون والرصيد.</div>}
  <div className="rounded-xl bg-blue-50 p-4 text-sm font-bold text-blue-900">الورد الصناعي والتغليف المستهلك للبوكسات لا يحتاج مخزون تفصيلي هنا؛ سجله كمصروف تشغيلي. البوكس نفسه يبقى منتج مخزون بسعر شراء وسعر بيع نهائي.</div>

  <section className="rounded-2xl bg-white p-5 shadow"><div className="mb-4 flex flex-wrap justify-between gap-2"><h2 className="text-xl font-black">1. الفاتورة والمورد</h2><button onClick={()=>setShowNewSupplier(true)} className="rounded-xl bg-gray-900 px-4 py-2 font-bold text-white">+ مورد سريع</button></div>
   <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><div className="relative"><label className="mb-2 block font-bold">المورد</label><input value={selectedSupplier?selectedSupplier.name:supplierSearch} onChange={e=>{setSupplierId("");setSupplierSearch(e.target.value)}} className={input} placeholder="ابحث عن المورد"/>{!selectedSupplier&&supplierSearch&&<div className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-xl border bg-white shadow">{supplierResults.map(s=><button key={s.id} onClick={()=>{setSupplierId(s.id);setSupplierSearch(s.name)}} className="block w-full border-b p-3 text-right hover:bg-emerald-50">{s.name} <span className="text-xs text-gray-400">{s.phone}</span></button>)}</div>}</div><Field label="رقم الفاتورة"><input className={input} value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)}/></Field><Field label="التاريخ"><input type="date" className={input} value={invoiceDate} onChange={e=>setInvoiceDate(e.target.value)}/></Field><Field label="نوع السداد"><select className={input} value={purchaseMode} onChange={e=>setPurchaseMode(e.target.value as any)}><option value="cash">مدفوع كامل</option><option value="mixed">مدفوع جزئي</option><option value="credit">آجل</option></select></Field></div>
  </section>

  <section className="rounded-2xl bg-white p-5 shadow"><div className="mb-4 flex flex-wrap justify-between gap-2"><h2 className="text-xl font-black">2. إضافة المنتجات</h2><button onClick={()=>setShowNewProduct(true)} className="rounded-xl bg-emerald-700 px-4 py-2 font-black text-white">+ منتج جديد غير موجود</button></div>
   <div className="grid gap-3 lg:grid-cols-[1.2fr_1.4fr_.6fr_.8fr_.8fr_auto]"><input className={input} value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔎 بحث سريع بالاسم أو القسم"/><select className={input} value={selectedDetailId} onChange={e=>setSelectedDetailId(e.target.value)}><option value="">اختار المنتج</option>{productResults.map(x=><option key={x.id} value={x.id}>{x.productName} — {x.name} — مخزون {x.stock}</option>)}</select><input type="number" min="1" className={input} value={qty} onChange={e=>setQty(e.target.value)} placeholder="الكمية"/><input type="number" min="0" step="0.01" className={input} value={buy} onChange={e=>setBuy(e.target.value)} placeholder="شراء"/><input type="number" min="0" step="0.01" className={input} value={sell} onChange={e=>setSell(e.target.value)} placeholder="بيع"/><button onClick={addItem} className="rounded-xl bg-gray-900 px-5 py-3 font-black text-white">إضافة</button></div>
   <input className={`${input} mt-3`} value={itemNotes} onChange={e=>setItemNotes(e.target.value)} placeholder="ملاحظة للبند — اختياري"/>
   <div className="mt-4 overflow-x-auto rounded-xl border"><table className="w-full min-w-[760px]"><thead className="bg-gray-50"><tr><Th>المنتج</Th><Th>الكمية</Th><Th>شراء</Th><Th>بيع</Th><Th>الإجمالي</Th><Th></Th></tr></thead><tbody>{items.map(x=><tr key={x.localId} className="border-t"><Td>{x.productName} — {x.detailName}</Td><Td>{x.quantity}</Td><Td>{money(x.unitPurchasePrice)}</Td><Td>{money(x.unitSellPrice)}</Td><Td>{money(x.quantity*x.unitPurchasePrice)}</Td><Td><button onClick={()=>setItems(v=>v.filter(i=>i.localId!==x.localId))} className="text-red-600">حذف</button></Td></tr>)}{items.length===0&&<tr><td colSpan={6} className="p-8 text-center text-gray-400">أضف المنتجات للفاتورة</td></tr>}</tbody></table></div>
  </section>

  <section className="rounded-2xl bg-white p-5 shadow"><h2 className="mb-4 text-xl font-black">3. السداد والمصاريف</h2><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Field label="توصيل المشتريات"><input type="number" className={input} value={deliveryCost} onChange={e=>setDeliveryCost(e.target.value)}/></Field><Field label="مصاريف أخرى"><input type="number" className={input} value={otherCosts} onChange={e=>setOtherCosts(e.target.value)}/></Field><Field label={purchaseMode==="mixed"?"طريقة دفع الجزء المدفوع":"طريقة الدفع"}><select className={input} value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as any)}><option value="cash">كاش</option><option value="bank_transfer">مصرف</option></select></Field><Field label="المدفوع"><input type="number" className={input} value={purchaseMode==="cash"?String(total||""):paidAmount} onChange={e=>setPaidAmount(e.target.value)} disabled={purchaseMode!=="mixed"}/></Field></div><textarea className={`${input} mt-4`} rows={2} value={invoiceNotes} onChange={e=>setInvoiceNotes(e.target.value)} placeholder="ملاحظات الفاتورة"/>
   <div className="mt-5 grid gap-3 sm:grid-cols-4"><Card label="المنتجات" value={subtotal}/><Card label="الإجمالي" value={total}/><Card label="المدفوع" value={paid}/><Card label="المتبقي" value={remaining} danger={remaining>0}/></div>
   <div className="mt-5 flex gap-3"><button disabled={saving} onClick={()=>void save()} className="rounded-xl bg-emerald-700 px-7 py-3 font-black text-white disabled:opacity-50">{saving?"جاري الحفظ...":editingInvoiceId?"حفظ تعديل الفاتورة":"حفظ فاتورة المشتريات"}</button><button onClick={reset} className="rounded-xl border px-6 py-3 font-bold">فاتورة جديدة</button></div>
  </section>

  <section className="rounded-2xl bg-white p-5 shadow"><h2 className="mb-4 text-xl font-black">آخر الفواتير</h2><div className="overflow-x-auto"><table className="w-full min-w-[850px]"><thead className="bg-emerald-700 text-white"><tr><Th>التاريخ</Th><Th>المورد</Th><Th>الفاتورة</Th><Th>الإجمالي</Th><Th>المدفوع</Th><Th>المتبقي</Th><Th>الدفع</Th><Th></Th></tr></thead><tbody>{invoices.map(x=><tr key={x.id} className="border-b"><Td>{x.invoiceDate}</Td><Td>{x.supplierName}</Td><Td>{x.invoiceNo||"—"}</Td><Td>{money(x.grandTotal)}</Td><Td>{money(x.paidAmount)}</Td><Td>{money(x.remainingAmount)}</Td><Td>{x.paymentMethod.includes("bank")?"مصرف":"كاش"}</Td><Td><button onClick={()=>void editInvoice(x)} className="rounded-lg bg-blue-100 px-3 py-2 font-bold text-blue-700">تعديل</button></Td></tr>)}</tbody></table></div></section>

  {showNewProduct&&<Modal title="إضافة منتج جديد من داخل المشتريات" close={()=>setShowNewProduct(false)}><div className="grid gap-3 md:grid-cols-2"><select className={input} value={newCategoryId} onChange={e=>setNewCategoryId(e.target.value)}><option value="">اختار القسم</option>{categories.filter(c=>Number(c.id)!==86).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><input className={input} value={newProductName} onChange={e=>setNewProductName(e.target.value)} placeholder="اسم المنتج — مثال: بوكس قلب"/><input className={input} value={newDetailName} onChange={e=>setNewDetailName(e.target.value)} placeholder="النوع/الحجم/اللون"/><input type="number" className={input} value={newBuy} onChange={e=>setNewBuy(e.target.value)} placeholder="سعر الشراء"/><input type="number" className={input} value={newSell} onChange={e=>setNewSell(e.target.value)} placeholder="سعر البيع النهائي"/></div><button onClick={()=>void createProduct()} className="mt-4 rounded-xl bg-emerald-700 px-6 py-3 font-black text-white">إنشاء واختياره</button></Modal>}
  {showNewSupplier&&<Modal title="إضافة مورد سريع" close={()=>setShowNewSupplier(false)}><div className="grid gap-3 md:grid-cols-2"><input className={input} value={newSupplierName} onChange={e=>setNewSupplierName(e.target.value)} placeholder="اسم المورد"/><input className={input} value={newSupplierPhone} onChange={e=>setNewSupplierPhone(e.target.value)} placeholder="الهاتف"/></div><button onClick={()=>void createSupplier()} className="mt-4 rounded-xl bg-gray-900 px-6 py-3 font-black text-white">حفظ المورد</button></Modal>}
 </div>
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label><span className="mb-2 block font-bold">{label}</span>{children}</label>}
function Th({children}:{children?:React.ReactNode}){return <th className="p-3 text-right">{children}</th>}
function Td({children}:{children?:React.ReactNode}){return <td className="p-3">{children}</td>}
function Card({label,value,danger=false}:{label:string;value:number;danger?:boolean}){return <div className={`rounded-xl p-4 ${danger?"bg-red-50 text-red-700":"bg-gray-50"}`}><p className="text-sm">{label}</p><p className="mt-1 text-xl font-black">{money(value)}</p></div>}
function Modal({title,close,children}:{title:string;close:()=>void;children:React.ReactNode}){return <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-4" dir="rtl"><div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-5 flex justify-between"><h2 className="text-2xl font-black">{title}</h2><button onClick={close} className="text-2xl">×</button></div>{children}</div></div>}
function money(v:number){return `${Number(v||0).toFixed(2)} د.ل`}
function today(){return new Date().toISOString().slice(0,10)}
function msg(e:unknown){return e instanceof Error?e.message:typeof e==="object"&&e&&"message" in e?String((e as any).message):"حدث خطأ غير متوقع"}