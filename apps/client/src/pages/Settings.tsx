import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { DEFAULT_WHATSAPP_SETTINGS, refreshWhatsAppSettings, saveWhatsAppSettings } from "../lib/whatsappSettings";
import { useBranch } from "../context/BranchContext";

import {
  loadSettings,
  saveSettings,
} from "../lib/settings";

import {
  deleteBouquetSizeSetting,
  deleteBoxVariantSetting,
  loadBouquetSizeSettings,
  loadBoxVariantSettings,
  saveBouquetSizeSetting,
  saveBoxVariantSetting,
  type BouquetSizeSetting,
  type BoxVariantSetting,
} from "../lib/orderSettings";

import {
  getOrderMaterials,
  isBoxMaterial,
  type OrderMaterial,
} from "../lib/orderCatalog";

type Tab =
  | "shop"
  | "invoice"
  | "printing"
  | "payments"
  | "bank"
  | "bouquets"
  | "boxes"
  | "delivery"
  | "notifications"
  | "whatsapp"
  | "attendance"
  | "branches"
  | "security"
  | "backup"
  | "system";

const emptyBouquetForm = {
  id: "",
  name: "",
  price: 0,
  minFlowers: 1,
  maxFlowers: 0,
  wrappingCount: 0,
  ribbonCount: 0,
  cardCount: 0,
  baseCount: 0,
  isActive: true,
};

const emptyBoxForm = {
  id: "",
  productDetailId: "",
  boxType: "",
  size: "",
  price: 0,
  flowersCount: 0,
  accessoriesCount: 0,
  wrappingCount: 0,
  ribbonCount: 0,
  cardCount: 0,
  isActive: true,
};

export default function Settings() {
  const { effectiveBranchId, selectedBranch } = useBranch();
  const [tab, setTab] = useState<Tab>("shop");

  // معلومات المحل
  const [shopName, setShopName] = useState("MOOD");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [currency, setCurrency] = useState("د.ل");
  const [logoUrl, setLogoUrl] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  // إعدادات الفاتورة
  const [invoiceTitle, setInvoiceTitle] = useState("فاتورة مبيعات");
  const [invoiceFooter, setInvoiceFooter] = useState("شكرًا لاختياركم MOOD");
  const [invoicePrefix, setInvoicePrefix] = useState("INV");
  const [invoiceShowLogo, setInvoiceShowLogo] = useState(true);
  const [invoiceShowAddress, setInvoiceShowAddress] = useState(true);
  const [invoiceShowPhone, setInvoiceShowPhone] = useState(true);
  const [invoiceShowCustomerPhone, setInvoiceShowCustomerPhone] =
    useState(true);
  const [invoiceShowNotes, setInvoiceShowNotes] = useState(true);
  const [invoiceShowPaymentMethod, setInvoiceShowPaymentMethod] =
    useState(true);
  const [invoicePaperSize, setInvoicePaperSize] = useState("A6");
  const [invoiceOrientation, setInvoiceOrientation] =
    useState("portrait");

  // إعدادات الطباعة
  const [printerName, setPrinterName] = useState("");
  const [printCopies, setPrintCopies] = useState(1);
  const [autoPrintCustomerInvoice, setAutoPrintCustomerInvoice] =
    useState(false);
  const [autoPrintProductionInvoice, setAutoPrintProductionInvoice] =
    useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(true);

  // طرق الدفع
  const [paymentCashEnabled, setPaymentCashEnabled] = useState(true);
  const [paymentCardEnabled, setPaymentCardEnabled] = useState(true);
  const [paymentTransferEnabled, setPaymentTransferEnabled] =
    useState(true);
  const [paymentDepositEnabled, setPaymentDepositEnabled] =
    useState(true);
  const [paymentMixedEnabled, setPaymentMixedEnabled] = useState(true);

  // بيانات البنك
  const [bankName, setBankName] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankIban, setBankIban] = useState("");
  const [bankNotes, setBankNotes] = useState("");

  // التوصيل
  const [deliveryEnabled, setDeliveryEnabled] = useState(true);
  const [defaultDeliveryFee, setDefaultDeliveryFee] = useState(0);
  const [freeDeliveryLimit, setFreeDeliveryLimit] = useState(0);
  const [deliveryNote, setDeliveryNote] = useState("");
  const [requireDeliveryAddress, setRequireDeliveryAddress] =
    useState(true);
  const [requireDeliveryPhone, setRequireDeliveryPhone] = useState(true);

  // النسخ الاحتياطي ومعلومات النظام
  const [backupEnabled, setBackupEnabled] = useState(true);
  const [backupReminderDays, setBackupReminderDays] = useState(7);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [systemVersion, setSystemVersion] = useState("1.0.0");
  const [systemName, setSystemName] = useState("MOOD Management System");

  // مركز التحكم المتقدم
  const notificationEvents = [
    ["order.new", "طلب جديد"],
    ["order.ready", "الطلب أصبح جاهزًا"],
    ["order.delivery", "خروج الطلب للتوصيل"],
    ["order.delivered", "تسليم الطلب"],
    ["order.edited", "تعديل أو حذف طلب"],
    ["stock.low", "انخفاض المخزون"],
    ["product.stagnant", "منتج راكد"],
    ["profit.lost", "أرباح مفقودة"],
    ["attendance.late", "تأخر موظف"],
    ["attendance.outside", "حضور خارج نطاق الفرع"],
    ["supplier.price_change", "تغير سعر مورد"],
    ["system.anomaly", "تنبيه غير طبيعي"],
  ] as const;
  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, {enabled:boolean; in_app:boolean; push_enabled:boolean}>>({});
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [whatsappAskAfterSave, setWhatsappAskAfterSave] = useState(true);
  const [whatsappIncludeTotals, setWhatsappIncludeTotals] = useState(true);
  const [whatsappSendReadyMessage, setWhatsappSendReadyMessage] = useState(true);
  const [whatsappSendCustomerCollectedMessage, setWhatsappSendCustomerCollectedMessage] = useState(true);
  const [whatsappSendDriverHandoverMessage, setWhatsappSendDriverHandoverMessage] = useState(true);
  const [whatsappInvoiceMessage, setWhatsappInvoiceMessage] = useState(DEFAULT_WHATSAPP_SETTINGS.invoiceMessage);
  const [whatsappReadyMessage, setWhatsappReadyMessage] = useState(DEFAULT_WHATSAPP_SETTINGS.readyMessage);
  const [whatsappCustomerCollectedMessage, setWhatsappCustomerCollectedMessage] = useState(DEFAULT_WHATSAPP_SETTINGS.customerCollectedMessage);
  const [whatsappDriverHandoverMessage, setWhatsappDriverHandoverMessage] = useState(DEFAULT_WHATSAPP_SETTINGS.driverHandoverMessage);
  const [whatsappInstanceId, setWhatsappInstanceId] = useState("");
  const [whatsappToken, setWhatsappToken] = useState("");
  const [savingWhatsApp, setSavingWhatsApp] = useState(false);
  const [attendanceGpsEnabled, setAttendanceGpsEnabled] = useState(true);
  const [attendanceGraceMinutes, setAttendanceGraceMinutes] = useState(10);
  const [attendanceRequireApprovedDevice, setAttendanceRequireApprovedDevice] = useState(false);
  const [defaultGpsRadius, setDefaultGpsRadius] = useState(150);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(480);
  const [rememberUsername, setRememberUsername] = useState(true);


  const [bouquetSizes, setBouquetSizes] = useState<BouquetSizeSetting[]>([]);
  const [boxVariants, setBoxVariants] = useState<BoxVariantSetting[]>([]);
  const [materials, setMaterials] = useState<OrderMaterial[]>([]);

  const [bouquetForm, setBouquetForm] = useState({
    ...emptyBouquetForm,
  });

  const [boxForm, setBoxForm] = useState({
    ...emptyBoxForm,
  });

  const [loading, setLoading] = useState(true);
  const [savingShop, setSavingShop] = useState(false);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [savingPrinting, setSavingPrinting] = useState(false);
  const [savingPayments, setSavingPayments] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [savingBackup, setSavingBackup] = useState(false);
  const [savingBouquet, setSavingBouquet] = useState(false);
  const [savingBox, setSavingBox] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (tab === "whatsapp" && effectiveBranchId) void loadBranchWhatsAppSettings();
  }, [tab, effectiveBranchId]);

  async function loadAll() {
    setLoading(true);

    try {
      const [shopData, bouquetData, boxData, materialsData] =
        await Promise.all([
          loadSettings(),
          loadBouquetSizeSettings(),
          loadBoxVariantSettings(),
          getOrderMaterials(),
        ]);

      setShopName(shopData?.shop_name || "MOOD");
      setPhone(shopData?.phone || "");
      setAddress(shopData?.address || "");
      setCurrency(shopData?.currency || "د.ل");
      setLogoUrl(shopData?.logo_url || "");
      setWhatsapp(shopData?.whatsapp || "");

      setInvoiceTitle(shopData?.invoice_title || "فاتورة مبيعات");
      setInvoiceFooter(
        shopData?.invoice_footer || "شكرًا لاختياركم MOOD"
      );
      setInvoicePrefix(shopData?.invoice_prefix || "INV");
      setInvoiceShowLogo(shopData?.invoice_show_logo ?? true);
      setInvoiceShowAddress(shopData?.invoice_show_address ?? true);
      setInvoiceShowPhone(shopData?.invoice_show_phone ?? true);
      setInvoiceShowCustomerPhone(
        shopData?.invoice_show_customer_phone ?? true
      );
      setInvoiceShowNotes(shopData?.invoice_show_notes ?? true);
      setInvoiceShowPaymentMethod(
        shopData?.invoice_show_payment_method ?? true
      );
      setInvoicePaperSize(shopData?.invoice_paper_size || "A6");
      setInvoiceOrientation(
        shopData?.invoice_orientation || "portrait"
      );

      setPrinterName(shopData?.printer_name || "");
      setPrintCopies(Number(shopData?.print_copies || 1));
      setAutoPrintCustomerInvoice(
        shopData?.auto_print_customer_invoice ?? false
      );
      setAutoPrintProductionInvoice(
        shopData?.auto_print_production_invoice ?? false
      );
      setShowPrintPreview(shopData?.show_print_preview ?? true);

      setPaymentCashEnabled(shopData?.payment_cash_enabled ?? true);
      setPaymentCardEnabled(shopData?.payment_card_enabled ?? true);
      setPaymentTransferEnabled(
        shopData?.payment_transfer_enabled ?? true
      );
      setPaymentDepositEnabled(
        shopData?.payment_deposit_enabled ?? true
      );
      setPaymentMixedEnabled(shopData?.payment_mixed_enabled ?? true);

      setBankName(shopData?.bank_name || "");
      setBankAccountName(shopData?.bank_account_name || "");
      setBankAccountNumber(shopData?.bank_account_number || "");
      setBankIban(shopData?.bank_iban || "");
      setBankNotes(shopData?.bank_notes || "");

      setDeliveryEnabled(shopData?.delivery_enabled ?? true);
      setDefaultDeliveryFee(
        Number(shopData?.default_delivery_fee || 0)
      );
      setFreeDeliveryLimit(Number(shopData?.free_delivery_limit || 0));
      setDeliveryNote(shopData?.delivery_note || "");
      setRequireDeliveryAddress(
        shopData?.require_delivery_address ?? true
      );
      setRequireDeliveryPhone(
        shopData?.require_delivery_phone ?? true
      );

      setBackupEnabled(shopData?.backup_enabled ?? true);
      setBackupReminderDays(
        Number(shopData?.backup_reminder_days || 7)
      );
      setLastBackupAt(shopData?.last_backup_at || null);
      setSystemVersion(shopData?.system_version || "1.0.0");
      setSystemName(
        shopData?.system_name || "MOOD Management System"
      );

      const advanced = JSON.parse(localStorage.getItem("mood_advanced_settings") || "{}");
      if (effectiveBranchId) {
        const branchWhatsApp = await refreshWhatsAppSettings(effectiveBranchId);
        applyWhatsAppSettings(branchWhatsApp);
      }
      setAttendanceGpsEnabled(advanced.attendanceGpsEnabled ?? true);
      setAttendanceGraceMinutes(Number(advanced.attendanceGraceMinutes ?? 10));
      setAttendanceRequireApprovedDevice(advanced.attendanceRequireApprovedDevice ?? false);
      setDefaultGpsRadius(Number(advanced.defaultGpsRadius ?? 150));
      setSessionTimeoutMinutes(Number(advanced.sessionTimeoutMinutes ?? 480));
      setRememberUsername(advanced.rememberUsername ?? true);

      const { data: authData } = await supabase.auth.getUser();
      if (authData.user) {
        const { data: prefs } = await supabase.from("notification_preferences")
          .select("event_key,enabled,in_app,push_enabled")
          .eq("user_id", authData.user.id)
          .is("branch_id", null);
        const mapped: Record<string, {enabled:boolean; in_app:boolean; push_enabled:boolean}> = {};
        for (const event of notificationEvents) mapped[event[0]] = { enabled: true, in_app: true, push_enabled: true };
        for (const pref of prefs || []) mapped[String(pref.event_key)] = { enabled: Boolean(pref.enabled), in_app: Boolean(pref.in_app), push_enabled: Boolean(pref.push_enabled) };
        setNotificationPrefs(mapped);
      }

      setBouquetSizes(bouquetData);
      setBoxVariants(boxData);
      setMaterials(materialsData);
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  const boxMaterials = useMemo(
    () => materials.filter(isBoxMaterial),
    [materials]
  );

  async function saveShop() {
    setSavingShop(true);

    try {
      await saveSettings({
        shop_name: shopName.trim() || "MOOD",
        phone: phone.trim(),
        address: address.trim(),
        currency: currency.trim() || "د.ل",
        logo_url: logoUrl.trim(),
        whatsapp: whatsapp.trim(),
      });

      alert("تم حفظ بيانات المحل ✅");
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setSavingShop(false);
    }
  }

  async function saveInvoiceSettings() {
    setSavingInvoice(true);

    try {
      await saveSettings({
        invoice_title: invoiceTitle.trim() || "فاتورة مبيعات",
        invoice_footer:
          invoiceFooter.trim() || "شكرًا لاختياركم MOOD",
        invoice_prefix: invoicePrefix.trim() || "INV",
        invoice_show_logo: invoiceShowLogo,
        invoice_show_address: invoiceShowAddress,
        invoice_show_phone: invoiceShowPhone,
        invoice_show_customer_phone: invoiceShowCustomerPhone,
        invoice_show_notes: invoiceShowNotes,
        invoice_show_payment_method: invoiceShowPaymentMethod,
        invoice_paper_size: invoicePaperSize,
        invoice_orientation: invoiceOrientation,
      });

      alert("تم حفظ إعدادات الفاتورة ✅");
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setSavingInvoice(false);
    }
  }

  async function savePrintingSettings() {
    setSavingPrinting(true);

    try {
      await saveSettings({
        printer_name: printerName.trim(),
        print_copies: Math.max(1, Number(printCopies || 1)),
        auto_print_customer_invoice: autoPrintCustomerInvoice,
        auto_print_production_invoice: autoPrintProductionInvoice,
        show_print_preview: showPrintPreview,
      });

      alert("تم حفظ إعدادات الطباعة ✅");
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setSavingPrinting(false);
    }
  }

  async function savePaymentSettings() {
    setSavingPayments(true);

    try {
      await saveSettings({
        payment_cash_enabled: paymentCashEnabled,
        payment_card_enabled: paymentCardEnabled,
        payment_transfer_enabled: paymentTransferEnabled,
        payment_deposit_enabled: paymentDepositEnabled,
        payment_mixed_enabled: paymentMixedEnabled,
      });

      alert("تم حفظ طرق الدفع ✅");
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setSavingPayments(false);
    }
  }

  async function saveBankSettings() {
    setSavingBank(true);

    try {
      await saveSettings({
        bank_name: bankName.trim(),
        bank_account_name: bankAccountName.trim(),
        bank_account_number: bankAccountNumber.trim(),
        bank_iban: bankIban.trim(),
        bank_notes: bankNotes.trim(),
      });

      alert("تم حفظ بيانات البنك ✅");
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setSavingBank(false);
    }
  }

  async function saveDeliverySettings() {
    setSavingDelivery(true);

    try {
      await saveSettings({
        delivery_enabled: deliveryEnabled,
        default_delivery_fee: Number(defaultDeliveryFee || 0),
        free_delivery_limit: Number(freeDeliveryLimit || 0),
        delivery_note: deliveryNote.trim(),
        require_delivery_address: requireDeliveryAddress,
        require_delivery_phone: requireDeliveryPhone,
      });

      alert("تم حفظ إعدادات التوصيل ✅");
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setSavingDelivery(false);
    }
  }

  async function saveBackupSettings() {
    setSavingBackup(true);

    try {
      await saveSettings({
        backup_enabled: backupEnabled,
        backup_reminder_days: Math.max(
          1,
          Number(backupReminderDays || 7)
        ),
      });

      alert("تم حفظ إعدادات النسخ الاحتياطي ✅");
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setSavingBackup(false);
    }
  }

  async function createBackup() {
    setSavingBackup(true);

    try {
      const currentSettings = await loadSettings();
      const createdAt = new Date().toISOString();

      const backup = {
        createdAt,
        system: "MOOD",
        settings: currentSettings,
        bouquetSizes,
        boxVariants,
      };

      const blob = new Blob(
        [JSON.stringify(backup, null, 2)],
        { type: "application/json;charset=utf-8" }
      );

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `mood-backup-${createdAt.slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      await saveSettings({ last_backup_at: createdAt });
      setLastBackupAt(createdAt);

      alert("تم إنشاء وتنزيل النسخة الاحتياطية ✅");
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setSavingBackup(false);
    }
  }

  async function saveBouquet() {
    setSavingBouquet(true);

    try {
      await saveBouquetSizeSetting({
        id: bouquetForm.id || undefined,
        name: bouquetForm.name,
        price: Number(bouquetForm.price || 0),
        minFlowers: Number(bouquetForm.minFlowers || 1),
        maxFlowers:
          Number(bouquetForm.maxFlowers || 0) === 0
            ? null
            : Number(bouquetForm.maxFlowers),
        wrappingCount: Number(bouquetForm.wrappingCount || 0),
        ribbonCount: Number(bouquetForm.ribbonCount || 0),
        cardCount: Number(bouquetForm.cardCount || 0),
        baseCount: Number(bouquetForm.baseCount || 0),
        isActive: bouquetForm.isActive,
      });

      setBouquetForm({ ...emptyBouquetForm });
      setBouquetSizes(await loadBouquetSizeSettings());

      alert(
        bouquetForm.id
          ? "تم تعديل حجم الباقة ✅"
          : "تمت إضافة حجم الباقة ✅"
      );
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setSavingBouquet(false);
    }
  }

  function editBouquet(size: BouquetSizeSetting) {
    setBouquetForm({
      id: size.id,
      name: size.name,
      price: size.price,
      minFlowers: size.minFlowers,
      maxFlowers: size.maxFlowers ?? 0,
      wrappingCount: size.wrappingCount,
      ribbonCount: size.ribbonCount,
      cardCount: size.cardCount,
      baseCount: size.baseCount,
      isActive: size.isActive,
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removeBouquet(id: string) {
    if (!confirm("هل تريد حذف هذا الحجم؟")) return;

    try {
      await deleteBouquetSizeSetting(id);
      setBouquetSizes(await loadBouquetSizeSettings());

      if (bouquetForm.id === id) {
        setBouquetForm({ ...emptyBouquetForm });
      }
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    }
  }

  async function saveBox() {
    setSavingBox(true);

    try {
      await saveBoxVariantSetting({
        id: boxForm.id || undefined,
        productDetailId: boxForm.productDetailId
          ? Number(boxForm.productDetailId)
          : null,
        boxType: boxForm.boxType,
        size: boxForm.size,
        price: Number(boxForm.price || 0),
        flowersCount: Number(boxForm.flowersCount || 0),
        accessoriesCount: Number(boxForm.accessoriesCount || 0),
        wrappingCount: Number(boxForm.wrappingCount || 0),
        ribbonCount: Number(boxForm.ribbonCount || 0),
        cardCount: Number(boxForm.cardCount || 0),
        isActive: boxForm.isActive,
      });

      setBoxForm({ ...emptyBoxForm });
      setBoxVariants(await loadBoxVariantSettings());

      alert(
        boxForm.id
          ? "تم تعديل إعداد البوكس ✅"
          : "تمت إضافة إعداد البوكس ✅"
      );
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setSavingBox(false);
    }
  }

  function editBox(box: BoxVariantSetting) {
    setBoxForm({
      id: box.id,
      productDetailId:
        box.productDetailId === null
          ? ""
          : String(box.productDetailId),
      boxType: box.boxType,
      size: box.size,
      price: box.price,
      flowersCount: box.flowersCount,
      accessoriesCount: box.accessoriesCount,
      wrappingCount: box.wrappingCount,
      ribbonCount: box.ribbonCount,
      cardCount: box.cardCount,
      isActive: box.isActive,
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removeBox(id: string) {
    if (!confirm("هل تريد حذف إعداد هذا البوكس؟")) return;

    try {
      await deleteBoxVariantSetting(id);
      setBoxVariants(await loadBoxVariantSettings());

      if (boxForm.id === id) {
        setBoxForm({ ...emptyBoxForm });
      }
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    }
  }

  function applyWhatsAppSettings(settings: typeof DEFAULT_WHATSAPP_SETTINGS) {
    setWhatsappAskAfterSave(settings.askAfterSave);
    setWhatsappIncludeTotals(settings.includeTotals);
    setWhatsappSendReadyMessage(settings.sendReadyMessage);
    setWhatsappSendCustomerCollectedMessage(settings.sendCustomerCollectedMessage);
    setWhatsappSendDriverHandoverMessage(settings.sendDriverHandoverMessage);
    setWhatsappInvoiceMessage(settings.invoiceMessage);
    setWhatsappReadyMessage(settings.readyMessage);
    setWhatsappCustomerCollectedMessage(settings.customerCollectedMessage);
    setWhatsappDriverHandoverMessage(settings.driverHandoverMessage);
    setWhatsappInstanceId(settings.instanceId);
    setWhatsappToken(settings.token);
  }

  async function loadBranchWhatsAppSettings() {
    if (!effectiveBranchId) return;
    const settings = await refreshWhatsAppSettings(effectiveBranchId);
    applyWhatsAppSettings(settings);
  }

  function saveAdvancedSettings() {
    const current = JSON.parse(localStorage.getItem("mood_advanced_settings") || "{}");
    localStorage.setItem("mood_advanced_settings", JSON.stringify({
      ...current,
      attendanceGpsEnabled, attendanceGraceMinutes, attendanceRequireApprovedDevice,
      defaultGpsRadius, sessionTimeoutMinutes, rememberUsername,
    }));
    alert("تم حفظ الإعدادات المتقدمة ✅");
  }

  async function saveBranchWhatsAppSettings() {
    if (!effectiveBranchId) {
      alert("اختر فرع MOOD أو Alpha أولًا، لا يمكن الحفظ على كل الفروع معًا.");
      return;
    }
    setSavingWhatsApp(true);
    try {
      await saveWhatsAppSettings(effectiveBranchId, {
        askAfterSave: whatsappAskAfterSave,
        includeTotals: whatsappIncludeTotals,
        sendReadyMessage: whatsappSendReadyMessage,
        sendCustomerCollectedMessage: whatsappSendCustomerCollectedMessage,
        sendDriverHandoverMessage: whatsappSendDriverHandoverMessage,
        invoiceMessage: whatsappInvoiceMessage,
        readyMessage: whatsappReadyMessage,
        customerCollectedMessage: whatsappCustomerCollectedMessage,
        driverHandoverMessage: whatsappDriverHandoverMessage,
        instanceId: whatsappInstanceId,
        token: whatsappToken,
        branchName: selectedBranch?.name || "المحل",
      });
      alert(`تم حفظ إعدادات واتساب لفرع ${selectedBranch?.name || "المحدد"} ✅`);
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setSavingWhatsApp(false);
    }
  }

  async function saveNotificationSettings() {
    setSavingNotifications(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error("يجب تسجيل الدخول");
      const rows = notificationEvents.map(([eventKey]) => ({
        user_id: authData.user!.id,
        branch_id: null,
        event_key: eventKey,
        enabled: notificationPrefs[eventKey]?.enabled ?? true,
        in_app: notificationPrefs[eventKey]?.in_app ?? true,
        push_enabled: notificationPrefs[eventKey]?.push_enabled ?? true,
      }));
      const { error } = await supabase.from("notification_preferences").upsert(rows, { onConflict: "user_id,branch_id,event_key" });
      if (error) throw error;
      alert("تم حفظ إعدادات الإشعارات ✅");
    } catch (error: unknown) { alert(getErrorMessage(error)); }
    finally { setSavingNotifications(false); }
  }

  if (loading) {
    return (
      <div className="p-8 text-2xl font-bold">
        جاري تحميل الإعدادات...
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8" dir="rtl">
      <div>
        <h1 className="text-4xl font-bold">إعدادات النظام</h1>
        <p className="mt-1 text-gray-500">
          إدارة بيانات المحل، الفواتير، الطباعة، الدفع والتوصيل
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <TabButton active={tab === "shop"} label="بيانات المحل" onClick={() => setTab("shop")} />
        <TabButton active={tab === "invoice"} label="الفواتير A6" onClick={() => setTab("invoice")} />
        <TabButton active={tab === "printing"} label="الطباعة" onClick={() => setTab("printing")} />
        <TabButton active={tab === "payments"} label="طرق الدفع" onClick={() => setTab("payments")} />
        <TabButton active={tab === "bank"} label="بيانات البنك" onClick={() => setTab("bank")} />
        <TabButton active={tab === "bouquets"} label="أحجام الباقات" onClick={() => setTab("bouquets")} />
        <TabButton active={tab === "boxes"} label="إعدادات البوكسات" onClick={() => setTab("boxes")} />
        <TabButton active={tab === "delivery"} label="التوصيل" onClick={() => setTab("delivery")} />
        <TabButton active={tab === "notifications"} label="🔔 الإشعارات" onClick={() => setTab("notifications")} />
        <TabButton active={tab === "whatsapp"} label="📱 واتساب" onClick={() => setTab("whatsapp")} />
        <TabButton active={tab === "attendance"} label="📍 الحضور" onClick={() => setTab("attendance")} />
        <TabButton active={tab === "branches"} label="🏢 الفروع" onClick={() => setTab("branches")} />
        <TabButton active={tab === "security"} label="🔒 الأمان" onClick={() => setTab("security")} />
        <TabButton active={tab === "backup"} label="النسخ الاحتياطي" onClick={() => setTab("backup")} />
        <TabButton active={tab === "system"} label="معلومات النظام" onClick={() => setTab("system")} />
      </div>

      {tab === "shop" && (
        <section className="space-y-5 rounded-2xl bg-white p-6 shadow">
          <SectionTitle
            title="بيانات المحل"
            description="تظهر هذه البيانات في الفواتير وواجهة النظام."
          />

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <InputField label="اسم المحل" value={shopName} onChange={setShopName} />
            <InputField label="رقم الهاتف" value={phone} onChange={setPhone} />
            <InputField label="رقم الواتساب" value={whatsapp} onChange={setWhatsapp} />
            <InputField label="العملة" value={currency} onChange={setCurrency} />
          </div>

          <Field label="رابط الشعار">
            <input
              value={logoUrl}
              onChange={(event) => setLogoUrl(event.target.value)}
              className="w-full rounded-xl border p-3"
              placeholder="ضع رابط صورة الشعار"
            />
          </Field>

          {logoUrl && (
            <div className="rounded-xl border bg-gray-50 p-4">
              <p className="mb-3 font-semibold">معاينة الشعار</p>
              <img
                src={logoUrl}
                alt="شعار المحل"
                className="h-28 max-w-full rounded-lg object-contain"
              />
            </div>
          )}

          <Field label="العنوان">
            <textarea
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              rows={3}
              className="w-full rounded-xl border p-3"
            />
          </Field>

          <SaveButton
            loading={savingShop}
            onClick={saveShop}
            label="حفظ بيانات المحل"
          />
        </section>
      )}

      {tab === "invoice" && (
        <section className="space-y-6 rounded-2xl bg-white p-6 shadow">
          <SectionTitle
            title="إعدادات فاتورة A6"
            description="حدد البيانات التي ستظهر داخل فاتورة العميل."
          />

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <InputField label="عنوان الفاتورة" value={invoiceTitle} onChange={setInvoiceTitle} />
            <InputField label="بادئة رقم الفاتورة" value={invoicePrefix} onChange={setInvoicePrefix} />

            <SelectField
              label="حجم الورق"
              value={invoicePaperSize}
              onChange={setInvoicePaperSize}
              options={[{ value: "A6", label: "A6" }]}
            />

            <SelectField
              label="اتجاه الفاتورة"
              value={invoiceOrientation}
              onChange={setInvoiceOrientation}
              options={[
                { value: "portrait", label: "عمودي" },
                { value: "landscape", label: "أفقي" },
              ]}
            />
          </div>

          <Field label="العبارة أسفل الفاتورة">
            <textarea
              value={invoiceFooter}
              onChange={(event) => setInvoiceFooter(event.target.value)}
              rows={3}
              className="w-full rounded-xl border p-3"
            />
          </Field>

          <div>
            <h3 className="mb-4 text-lg font-bold">البيانات الظاهرة</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              <ToggleField label="إظهار الشعار" checked={invoiceShowLogo} onChange={setInvoiceShowLogo} />
              <ToggleField label="إظهار عنوان المحل" checked={invoiceShowAddress} onChange={setInvoiceShowAddress} />
              <ToggleField label="إظهار هاتف المحل" checked={invoiceShowPhone} onChange={setInvoiceShowPhone} />
              <ToggleField label="إظهار هاتف العميل" checked={invoiceShowCustomerPhone} onChange={setInvoiceShowCustomerPhone} />
              <ToggleField label="إظهار الملاحظات" checked={invoiceShowNotes} onChange={setInvoiceShowNotes} />
              <ToggleField label="إظهار طريقة الدفع" checked={invoiceShowPaymentMethod} onChange={setInvoiceShowPaymentMethod} />
            </div>
          </div>

          <SaveButton
            loading={savingInvoice}
            onClick={saveInvoiceSettings}
            label="حفظ إعدادات الفاتورة"
          />
        </section>
      )}

      {tab === "printing" && (
        <section className="space-y-6 rounded-2xl bg-white p-6 shadow">
          <SectionTitle
            title="إعدادات الطباعة"
            description="إعدادات عامة تستخدمها شاشة طباعة الفواتير."
          />

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <InputField
              label="اسم الطابعة"
              value={printerName}
              onChange={setPrinterName}
              placeholder="مثال: HP A6 Printer"
            />

            <NumberField
              label="عدد النسخ"
              value={printCopies}
              onChange={setPrintCopies}
              min={1}
              step="1"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ToggleField
              label="إظهار المعاينة قبل الطباعة"
              checked={showPrintPreview}
              onChange={setShowPrintPreview}
            />
            <ToggleField
              label="طباعة فاتورة العميل تلقائيًا"
              checked={autoPrintCustomerInvoice}
              onChange={setAutoPrintCustomerInvoice}
            />
            <ToggleField
              label="طباعة ورقة الإنتاج تلقائيًا"
              checked={autoPrintProductionInvoice}
              onChange={setAutoPrintProductionInvoice}
            />
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
            اختيار الطابعة الفعلية يتم من نافذة الطباعة في المتصفح. اسم الطابعة هنا يُحفظ كمرجع داخل النظام.
          </div>

          <SaveButton
            loading={savingPrinting}
            onClick={savePrintingSettings}
            label="حفظ إعدادات الطباعة"
          />
        </section>
      )}

      {tab === "payments" && (
        <section className="space-y-6 rounded-2xl bg-white p-6 shadow">
          <SectionTitle
            title="طرق الدفع"
            description="شغّل أو أوقف الطرق التي تريد إظهارها عند إنشاء الطلب."
          />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <ToggleField label="الدفع النقدي" checked={paymentCashEnabled} onChange={setPaymentCashEnabled} />
            <ToggleField label="البطاقة المصرفية" checked={paymentCardEnabled} onChange={setPaymentCardEnabled} />
            <ToggleField label="التحويل المصرفي" checked={paymentTransferEnabled} onChange={setPaymentTransferEnabled} />
            <ToggleField label="العربون / الدفعة المقدمة" checked={paymentDepositEnabled} onChange={setPaymentDepositEnabled} />
            <ToggleField label="الدفع المختلط" checked={paymentMixedEnabled} onChange={setPaymentMixedEnabled} />
          </div>

          <SaveButton
            loading={savingPayments}
            onClick={savePaymentSettings}
            label="حفظ طرق الدفع"
          />
        </section>
      )}

      {tab === "bank" && (
        <section className="space-y-6 rounded-2xl bg-white p-6 shadow">
          <SectionTitle
            title="بيانات البنك"
            description="تُستخدم في الفواتير والتحويلات المصرفية."
          />

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <InputField label="اسم البنك" value={bankName} onChange={setBankName} />
            <InputField label="اسم صاحب الحساب" value={bankAccountName} onChange={setBankAccountName} />
            <InputField label="رقم الحساب" value={bankAccountNumber} onChange={setBankAccountNumber} />
            <InputField label="IBAN" value={bankIban} onChange={setBankIban} />
          </div>

          <Field label="ملاحظات البنك">
            <textarea
              value={bankNotes}
              onChange={(event) => setBankNotes(event.target.value)}
              rows={3}
              className="w-full rounded-xl border p-3"
            />
          </Field>

          <SaveButton
            loading={savingBank}
            onClick={saveBankSettings}
            label="حفظ بيانات البنك"
          />
        </section>
      )}

      {tab === "bouquets" && (
        <div className="space-y-6">
          <section className="rounded-2xl bg-white p-6 shadow">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-2xl font-bold">
                {bouquetForm.id ? "تعديل حجم باقة" : "إضافة حجم باقة"}
              </h2>

              {bouquetForm.id && (
                <button
                  type="button"
                  onClick={() => setBouquetForm({ ...emptyBouquetForm })}
                  className="rounded-lg border px-4 py-2"
                >
                  إلغاء التعديل
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InputField
                label="اسم الحجم"
                value={bouquetForm.name}
                onChange={(value) =>
                  setBouquetForm((current) => ({ ...current, name: value }))
                }
                placeholder="مثال: وسط"
              />

              <NumberField
                label="سعر الحجم"
                value={bouquetForm.price}
                onChange={(value) =>
                  setBouquetForm((current) => ({ ...current, price: value }))
                }
              />

              <NumberField
                label="أقل عدد ورد"
                value={bouquetForm.minFlowers}
                onChange={(value) =>
                  setBouquetForm((current) => ({
                    ...current,
                    minFlowers: value,
                  }))
                }
                min={1}
                step="1"
              />

              <NumberField
                label="أعلى عدد ورد (0 = بدون حد)"
                value={bouquetForm.maxFlowers}
                onChange={(value) =>
                  setBouquetForm((current) => ({
                    ...current,
                    maxFlowers: value,
                  }))
                }
                min={0}
                step="1"
              />

              <NumberField
                label="عدد ورق التغليف"
                value={bouquetForm.wrappingCount}
                onChange={(value) =>
                  setBouquetForm((current) => ({
                    ...current,
                    wrappingCount: value,
                  }))
                }
              />

              <NumberField
                label="عدد الشرائط"
                value={bouquetForm.ribbonCount}
                onChange={(value) =>
                  setBouquetForm((current) => ({
                    ...current,
                    ribbonCount: value,
                  }))
                }
              />

              <NumberField
                label="عدد الكروت"
                value={bouquetForm.cardCount}
                onChange={(value) =>
                  setBouquetForm((current) => ({
                    ...current,
                    cardCount: value,
                  }))
                }
              />

              <NumberField
                label="عدد القواعد"
                value={bouquetForm.baseCount}
                onChange={(value) =>
                  setBouquetForm((current) => ({
                    ...current,
                    baseCount: value,
                  }))
                }
              />

              <ToggleField
                label="الحجم فعال"
                checked={bouquetForm.isActive}
                onChange={(checked) =>
                  setBouquetForm((current) => ({
                    ...current,
                    isActive: checked,
                  }))
                }
              />
            </div>

            <SaveButton
              loading={savingBouquet}
              onClick={saveBouquet}
              label={bouquetForm.id ? "حفظ التعديل" : "إضافة الحجم"}
            />
          </section>

          <section className="rounded-2xl bg-white p-6 shadow">
            <h2 className="mb-5 text-2xl font-bold">الأحجام الحالية</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px]">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-3 text-right">الحجم</th>
                    <th className="p-3 text-right">من عدد ورد</th>
                    <th className="p-3 text-right">إلى عدد ورد</th>
                    <th className="p-3 text-right">السعر</th>
                    <th className="p-3 text-right">الورق</th>
                    <th className="p-3 text-right">الشريط</th>
                    <th className="p-3 text-right">الكرت</th>
                    <th className="p-3 text-right">القاعدة</th>
                    <th className="p-3 text-right">الحالة</th>
                    <th className="p-3 text-right">الإجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {bouquetSizes.map((size) => (
                    <tr key={size.id} className="border-b">
                      <td className="p-3 font-semibold">{size.name}</td>
                      <td className="p-3">{size.minFlowers}</td>
                      <td className="p-3">
                        {size.maxFlowers === null
                          ? "بدون حد"
                          : size.maxFlowers}
                      </td>
                      <td className="p-3">{size.price.toFixed(2)} د.ل</td>
                      <td className="p-3">{size.wrappingCount}</td>
                      <td className="p-3">{size.ribbonCount}</td>
                      <td className="p-3">{size.cardCount}</td>
                      <td className="p-3">{size.baseCount}</td>
                      <td className="p-3">{size.isActive ? "فعال" : "متوقف"}</td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => editBouquet(size)}
                            className="rounded-lg bg-blue-100 px-3 py-2 text-blue-700"
                          >
                            تعديل
                          </button>
                          <button
                            type="button"
                            onClick={() => removeBouquet(size.id)}
                            className="rounded-lg bg-red-100 px-3 py-2 text-red-700"
                          >
                            حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {bouquetSizes.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-gray-500">
                        لا توجد أحجام باقات.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === "boxes" && (
        <div className="space-y-6">
          <section className="rounded-2xl bg-white p-6 shadow">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-2xl font-bold">
                {boxForm.id ? "تعديل إعداد بوكس" : "إضافة إعداد بوكس"}
              </h2>

              {boxForm.id && (
                <button
                  type="button"
                  onClick={() => setBoxForm({ ...emptyBoxForm })}
                  className="rounded-lg border px-4 py-2"
                >
                  إلغاء التعديل
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="mb-2 block font-semibold">
                  البوكس من المخزون
                </label>
                <select
                  value={boxForm.productDetailId}
                  onChange={(event) => {
                    const value = event.target.value;
                    const selectedMaterial = boxMaterials.find(
                      (material) => String(material.id) === value
                    );

                    setBoxForm((current) => ({
                      ...current,
                      productDetailId: value,
                      boxType:
                        current.boxType ||
                        selectedMaterial?.productName ||
                        selectedMaterial?.name ||
                        "",
                    }));
                  }}
                  className="w-full rounded-xl border p-3"
                >
                  <option value="">بدون ربط بالمخزون</option>
                  {boxMaterials.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.productName || material.name}
                      {material.color ? ` - ${material.color}` : ""}
                      {" — "}المتوفر {material.stock}
                    </option>
                  ))}
                </select>
              </div>

              <InputField
                label="نوع البوكس"
                value={boxForm.boxType}
                onChange={(value) =>
                  setBoxForm((current) => ({ ...current, boxType: value }))
                }
              />

              <InputField
                label="الحجم"
                value={boxForm.size}
                onChange={(value) =>
                  setBoxForm((current) => ({ ...current, size: value }))
                }
              />

              <NumberField
                label="سعر البوكس"
                value={boxForm.price}
                onChange={(value) =>
                  setBoxForm((current) => ({ ...current, price: value }))
                }
              />

              <NumberField
                label="عدد الورد"
                value={boxForm.flowersCount}
                onChange={(value) =>
                  setBoxForm((current) => ({
                    ...current,
                    flowersCount: value,
                  }))
                }
              />

              <NumberField
                label="عدد الإضافات"
                value={boxForm.accessoriesCount}
                onChange={(value) =>
                  setBoxForm((current) => ({
                    ...current,
                    accessoriesCount: value,
                  }))
                }
              />

              <NumberField
                label="عدد ورق التغليف"
                value={boxForm.wrappingCount}
                onChange={(value) =>
                  setBoxForm((current) => ({
                    ...current,
                    wrappingCount: value,
                  }))
                }
              />

              <NumberField
                label="عدد الشرائط"
                value={boxForm.ribbonCount}
                onChange={(value) =>
                  setBoxForm((current) => ({
                    ...current,
                    ribbonCount: value,
                  }))
                }
              />

              <NumberField
                label="عدد الكروت"
                value={boxForm.cardCount}
                onChange={(value) =>
                  setBoxForm((current) => ({
                    ...current,
                    cardCount: value,
                  }))
                }
              />

              <ToggleField
                label="الإعداد فعال"
                checked={boxForm.isActive}
                onChange={(checked) =>
                  setBoxForm((current) => ({
                    ...current,
                    isActive: checked,
                  }))
                }
              />
            </div>

            <SaveButton
              loading={savingBox}
              onClick={saveBox}
              label={boxForm.id ? "حفظ التعديل" : "إضافة إعداد البوكس"}
              colorClass="bg-purple-700"
            />
          </section>

          <section className="rounded-2xl bg-white p-6 shadow">
            <h2 className="mb-5 text-2xl font-bold">
              إعدادات البوكسات الحالية
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px]">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-3 text-right">النوع</th>
                    <th className="p-3 text-right">الحجم</th>
                    <th className="p-3 text-right">السعر</th>
                    <th className="p-3 text-right">الورد</th>
                    <th className="p-3 text-right">الإضافات</th>
                    <th className="p-3 text-right">الورق</th>
                    <th className="p-3 text-right">الشريط</th>
                    <th className="p-3 text-right">الكرت</th>
                    <th className="p-3 text-right">الحالة</th>
                    <th className="p-3 text-right">الإجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {boxVariants.map((box) => (
                    <tr key={box.id} className="border-b">
                      <td className="p-3 font-semibold">{box.boxType}</td>
                      <td className="p-3">{box.size}</td>
                      <td className="p-3">{box.price.toFixed(2)} د.ل</td>
                      <td className="p-3">{box.flowersCount}</td>
                      <td className="p-3">{box.accessoriesCount}</td>
                      <td className="p-3">{box.wrappingCount}</td>
                      <td className="p-3">{box.ribbonCount}</td>
                      <td className="p-3">{box.cardCount}</td>
                      <td className="p-3">{box.isActive ? "فعال" : "متوقف"}</td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => editBox(box)}
                            className="rounded-lg bg-blue-100 px-3 py-2 text-blue-700"
                          >
                            تعديل
                          </button>
                          <button
                            type="button"
                            onClick={() => removeBox(box.id)}
                            className="rounded-lg bg-red-100 px-3 py-2 text-red-700"
                          >
                            حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {boxVariants.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-gray-500">
                        لا توجد إعدادات بوكسات.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === "delivery" && (
        <section className="space-y-6 rounded-2xl bg-white p-6 shadow">
          <SectionTitle
            title="إعدادات التوصيل"
            description="إعدادات افتراضية لا تغيّر منطق حساب التوصيل الحالي."
          />

          <ToggleField
            label="تفعيل خدمة التوصيل"
            checked={deliveryEnabled}
            onChange={setDeliveryEnabled}
          />

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <NumberField
              label="سعر التوصيل الافتراضي"
              value={defaultDeliveryFee}
              onChange={setDefaultDeliveryFee}
            />
            <NumberField
              label="حد التوصيل المجاني"
              value={freeDeliveryLimit}
              onChange={setFreeDeliveryLimit}
            />
          </div>

          <Field label="ملاحظة التوصيل">
            <textarea
              value={deliveryNote}
              onChange={(event) => setDeliveryNote(event.target.value)}
              rows={3}
              className="w-full rounded-xl border p-3"
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ToggleField
              label="العنوان مطلوب عند التوصيل"
              checked={requireDeliveryAddress}
              onChange={setRequireDeliveryAddress}
            />
            <ToggleField
              label="رقم الهاتف مطلوب عند التوصيل"
              checked={requireDeliveryPhone}
              onChange={setRequireDeliveryPhone}
            />
          </div>

          <SaveButton
            loading={savingDelivery}
            onClick={saveDeliverySettings}
            label="حفظ إعدادات التوصيل"
          />
        </section>
      )}

      {tab === "notifications" && (
        <section className="space-y-5 rounded-2xl bg-white p-6 shadow">
          <SectionTitle title="التحكم في الإشعارات" description="فعّل أو أوقف كل نوع، وحدد ظهوره داخل المنظومة أو كإشعار Push." />
          <div className="space-y-3">
            {notificationEvents.map(([key, label]) => {
              const pref = notificationPrefs[key] || { enabled: true, in_app: true, push_enabled: true };
              const update = (patch: Partial<typeof pref>) => setNotificationPrefs((current) => ({ ...current, [key]: { ...pref, ...patch } }));
              return <div key={key} className="grid gap-3 rounded-xl border p-4 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
                <span className="font-bold">{label}</span>
                <ToggleField label="تشغيل" checked={pref.enabled} onChange={(v) => update({ enabled: v })} />
                <ToggleField label="داخل النظام" checked={pref.in_app} onChange={(v) => update({ in_app: v })} />
                <ToggleField label="Push" checked={pref.push_enabled} onChange={(v) => update({ push_enabled: v })} />
              </div>;
            })}
          </div>
          <SaveButton loading={savingNotifications} onClick={() => void saveNotificationSettings()} label="حفظ إعدادات الإشعارات" />
        </section>
      )}

      {tab === "whatsapp" && (
        <section className="space-y-5 rounded-2xl bg-white p-6 shadow">
          <SectionTitle title="إعدادات واتساب" description={`الإعدادات الحالية خاصة بفرع ${selectedBranch?.name || "غير محدد"}. كل فرع يرسل من رقمه وحسابه المستقل.`} />
          {!effectiveBranchId && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 font-bold text-amber-900">اختر MOOD أو Alpha من محدد الفروع بالأعلى لتعديل إعداداته.</div>}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="UltraMsg Instance ID"><input value={whatsappInstanceId} onChange={(e) => setWhatsappInstanceId(e.target.value)} className="w-full rounded-xl border p-3" placeholder="instance123456" /></Field>
            <Field label="UltraMsg Token"><input type="password" value={whatsappToken} onChange={(e) => setWhatsappToken(e.target.value)} className="w-full rounded-xl border p-3" placeholder="Token الخاص بالفرع" /></Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <ToggleField label="إرسال رسالة واتساب تلقائيًا بعد حفظ الطلب" checked={whatsappAskAfterSave} onChange={setWhatsappAskAfterSave} />
            <ToggleField label="تضمين الإجمالي والمدفوع والمتبقي" checked={whatsappIncludeTotals} onChange={setWhatsappIncludeTotals} />
            <ToggleField label="رسالة عند جاهزية الطلب" checked={whatsappSendReadyMessage} onChange={setWhatsappSendReadyMessage} />
            <ToggleField label="رسالة عند استلام العميل" checked={whatsappSendCustomerCollectedMessage} onChange={setWhatsappSendCustomerCollectedMessage} />
            <ToggleField label="رسالة عند استلام المندوب" checked={whatsappSendDriverHandoverMessage} onChange={setWhatsappSendDriverHandoverMessage} />
          </div>
          <Field label="رسالة إرسال فاتورة PDF"><textarea rows={6} value={whatsappInvoiceMessage} onChange={(e) => setWhatsappInvoiceMessage(e.target.value)} className="w-full rounded-xl border p-3" /></Field>
          <Field label="رسالة الطلب جاهز"><textarea rows={5} value={whatsappReadyMessage} onChange={(e) => setWhatsappReadyMessage(e.target.value)} className="w-full rounded-xl border p-3" /></Field>
          <Field label="رسالة استلمه العميل"><textarea rows={5} value={whatsappCustomerCollectedMessage} onChange={(e) => setWhatsappCustomerCollectedMessage(e.target.value)} className="w-full rounded-xl border p-3" /></Field>
          <Field label="رسالة استلمه المندوب"><textarea rows={5} value={whatsappDriverHandoverMessage} onChange={(e) => setWhatsappDriverHandoverMessage(e.target.value)} className="w-full rounded-xl border p-3" /></Field>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-7 text-emerald-900">
            <b>المتغيرات المتاحة:</b> {'{customer_name}'}، {'{order_number}'}، {'{total}'}، {'{paid}'}، {'{remaining}'}، {'{delegate_name}'}، {'{branch_name}'}
          </div>
          <SaveButton loading={savingWhatsApp} onClick={() => void saveBranchWhatsAppSettings()} label="حفظ إعدادات واتساب للفرع" />
        </section>
      )}

      {tab === "attendance" && (
        <section className="space-y-5 rounded-2xl bg-white p-6 shadow">
          <SectionTitle title="إعدادات الحضور والانصراف" description="تحكم في التحقق الجغرافي والتأخير والأجهزة." />
          <ToggleField label="تفعيل التحقق بالـ GPS" checked={attendanceGpsEnabled} onChange={setAttendanceGpsEnabled} />
          <ToggleField label="السماح فقط من جهاز معتمد" checked={attendanceRequireApprovedDevice} onChange={setAttendanceRequireApprovedDevice} />
          <div className="grid gap-5 md:grid-cols-2">
            <NumberField label="دقائق السماح قبل التأخير" value={attendanceGraceMinutes} onChange={setAttendanceGraceMinutes} min={0} />
            <NumberField label="نطاق GPS الافتراضي بالمتر" value={defaultGpsRadius} onChange={setDefaultGpsRadius} min={20} />
          </div>
          <SaveButton loading={false} onClick={saveAdvancedSettings} label="حفظ إعدادات الحضور" />
        </section>
      )}

      {tab === "branches" && (
        <section className="space-y-5 rounded-2xl bg-white p-6 shadow">
          <SectionTitle title="إعدادات الفروع" description="إدارة أسماء الفروع ومواقعها ونطاق GPS تتم من صفحة الفروع. هذه الصفحة تربط الإعدادات العامة بها." />
          <div className="rounded-xl border bg-gray-50 p-5 text-gray-700">من صفحة <b>الفروع</b> يمكنك إضافة الفرع الثاني، تعديل الموقع، ساعات العمل ونطاق الحضور لكل فرع.</div>
          <NumberField label="نطاق GPS الافتراضي للفروع الجديدة" value={defaultGpsRadius} onChange={setDefaultGpsRadius} min={20} />
          <SaveButton loading={false} onClick={saveAdvancedSettings} label="حفظ إعدادات الفروع" />
        </section>
      )}

      {tab === "security" && (
        <section className="space-y-5 rounded-2xl bg-white p-6 shadow">
          <SectionTitle title="الأمان وتسجيل الدخول" description="إعدادات الجلسات والدخول السريع بدون تخزين كلمة السر كنص مكشوف." />
          <ToggleField label="تذكر اسم المستخدم" checked={rememberUsername} onChange={setRememberUsername} />
          <NumberField label="مدة الجلسة قبل تسجيل الخروج التلقائي بالدقائق" value={sessionTimeoutMinutes} onChange={setSessionTimeoutMinutes} min={15} />
          <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">للدخول السريع نعتمد جلسة Supabase الآمنة وتذكر اسم المستخدم. لا يتم تخزين كلمة المرور داخل المنظومة.</div>
          <SaveButton loading={false} onClick={saveAdvancedSettings} label="حفظ إعدادات الأمان" />
        </section>
      )}

      {tab === "backup" && (
        <section className="space-y-6 rounded-2xl bg-white p-6 shadow">
          <SectionTitle
            title="النسخ الاحتياطي"
            description="تنزيل نسخة JSON من الإعدادات وأحجام الباقات وإعدادات البوكسات."
          />

          <ToggleField
            label="تفعيل تذكير النسخ الاحتياطي"
            checked={backupEnabled}
            onChange={setBackupEnabled}
          />

          <NumberField
            label="التذكير كل عدد أيام"
            value={backupReminderDays}
            onChange={setBackupReminderDays}
            min={1}
            step="1"
          />

          <div className="rounded-xl border bg-gray-50 p-4">
            <p className="font-semibold">آخر نسخة احتياطية</p>
            <p className="mt-1 text-gray-600">
              {lastBackupAt
                ? new Date(lastBackupAt).toLocaleString("ar-LY")
                : "لم يتم إنشاء نسخة من داخل النظام بعد."}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <SaveButton
              loading={savingBackup}
              onClick={saveBackupSettings}
              label="حفظ إعدادات النسخ"
            />

            <button
              type="button"
              onClick={createBackup}
              disabled={savingBackup}
              className="rounded-xl bg-blue-700 px-8 py-3 font-bold text-white disabled:opacity-50"
            >
              {savingBackup ? "جاري التجهيز..." : "إنشاء وتنزيل نسخة الآن"}
            </button>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
            هذه النسخة تغطي إعدادات النظام الحالية. النسخة الكاملة لقاعدة بيانات Supabase تُدار لاحقًا من لوحة Supabase.
          </div>
        </section>
      )}

      {tab === "system" && (
        <section className="space-y-6 rounded-2xl bg-white p-6 shadow">
          <SectionTitle
            title="معلومات النظام"
            description="بيانات تعريفية للنسخة الحالية من منظومة MOOD."
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <InfoCard label="اسم النظام" value={systemName} />
            <InfoCard label="إصدار النظام" value={systemVersion} />
            <InfoCard label="قاعدة البيانات" value="Supabase" />
            <InfoCard label="الواجهة" value="React + TypeScript" />
            <InfoCard label="حجم الفاتورة" value={invoicePaperSize} />
            <InfoCard label="العملة" value={currency} />
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
            النظام متصل بقاعدة البيانات وجاهز لمرحلة تصميم فاتورة A6 والمراجعة النهائية.
          </div>
        </section>
      )}
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-5 py-3 font-semibold transition ${
        active
          ? "bg-emerald-700 text-white"
          : "bg-white text-gray-700 shadow hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mt-1 text-gray-500">{description}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block font-semibold">{label}</label>
      {children}
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-2 block font-semibold">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border p-3"
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  step = "0.01",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  step?: string;
}) {
  return (
    <div>
      <label className="mb-2 block font-semibold">{label}</label>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value || 0))}
        className="w-full rounded-xl border p-3"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="mb-2 block font-semibold">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border p-3"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-xl border p-4">
      <span className="font-semibold">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5"
      />
    </label>
  );
}

function SaveButton({
  loading,
  onClick,
  label,
  colorClass = "bg-emerald-700",
}: {
  loading: boolean;
  onClick: () => void;
  label: string;
  colorClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`mt-2 rounded-xl px-8 py-3 font-bold text-white disabled:opacity-50 ${colorClass}`}
    >
      {loading ? "جاري الحفظ..." : label}
    </button>
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-gray-50 p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "حدث خطأ غير متوقع";
}