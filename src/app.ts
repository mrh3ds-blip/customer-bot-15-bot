import "dotenv/config";
import express from "express";
import { Markup, Telegraf } from "telegraf";

const token = process.env.CUSTOMER_BOT_TOKEN;
const adminId = Number(process.env.CUSTOMER_ADMIN_ID || "0");
const baseUrl = (process.env.BASE_URL || "").replace(/\/$/, "");

const bot = new Telegraf(token || "missing");
const app = express();
app.use(express.json());

const status = { ready: false, startedAt: new Date().toISOString(), error: null as string | null };

const BUSINESS_NAME = "فروشگاه بزرگ شیراز";
const WELCOME_MESSAGE = "خیلی خوش آمدید قدم";
const SUPPORT_CONTACT: string = "ارتباطی";
const TEMPLATE_CODE: string = "SHOP";
const TEMPLATE_TITLE = "فروشگاهی";
const DETAILS_RAW = "محصول یک\nمحصول دو\nمحصول سه";
const DETAIL_LINES = [
  "محصول یک",
  "محصول دو",
  "محصول سه"
];
const FEATURES = [
  "پرداخت کارت‌به‌کارت و تایید رسید",
  "مدیریت محصول/خدمت",
  "چند ادمین",
  "پنل مدیریت ساده",
  "درگاه پرداخت آنلاین",
  "گزارش‌گیری"
];
const PAYMENT_LINK = process.env.PAYMENT_LINK || "";
const CARD_NUMBER = process.env.CARD_NUMBER || "";
const CARD_HOLDER = process.env.CARD_HOLDER || "";

type Session = {
  mode: "form" | "support" | "reservation" | "service" | "shop" | "course";
  step: number;
  answers: string[];
  meta?: Record<string, string>;
};

const sessions = new Map<number, Session>();

function linesOrFallback(fallback: string[]) {
  return DETAIL_LINES.length ? DETAIL_LINES : fallback;
}

function formQuestions() {
  if (TEMPLATE_CODE === "FORM") {
    return linesOrFallback(["نام و نام خانوادگی", "شماره تماس", "توضیحات یا درخواست شما"]);
  }
  return ["نام و نام خانوادگی", "شماره تماس", "توضیحات"];
}

function productList() {
  return linesOrFallback(["محصول نمونه ۱", "محصول نمونه ۲", "خدمت نمونه"]);
}

function serviceList() {
  return linesOrFallback(["خدمت اول", "خدمت دوم", "مشاوره"]);
}

function mainMenu() {
  const rows: string[][] = [];

  if (TEMPLATE_CODE === "SHOP") rows.push(["🛍 محصولات", "🧾 ثبت سفارش"]);
  else if (TEMPLATE_CODE === "SUPPORT") rows.push(["🎫 ثبت تیکت", "❓ سوالات متداول"]);
  else if (TEMPLATE_CODE === "RESERVATION") rows.push(["📅 رزرو نوبت", "📋 خدمات"]);
  else if (TEMPLATE_CODE === "COURSE_FILE") rows.push(["🎓 دوره‌ها / فایل‌ها", "🧾 درخواست خرید"]);
  else if (TEMPLATE_CODE === "FORM") rows.push(["📝 شروع فرم", "ℹ️ راهنما"]);
  else rows.push(["📝 ثبت سفارش خدمات", "📋 خدمات"]);

  rows.push(["💳 پرداخت", "☎️ پشتیبانی"]);
  rows.push(["ℹ️ درباره ما"]);
  return Markup.keyboard(rows).resize();
}

function userLabel(ctx: any) {
  return ctx.from?.username ? "@" + ctx.from.username : String(ctx.chat?.id || "unknown");
}

async function notifyAdmin(title: string, ctx: any, body: string) {
  if (!adminId) return;
  await ctx.telegram.sendMessage(
    adminId,
    title + "\n\n" +
      "کسب‌وکار: " + BUSINESS_NAME + "\n" +
      "نوع ربات: " + TEMPLATE_TITLE + "\n" +
      "کاربر: " + userLabel(ctx) + "\n\n" +
      body
  );
}

function startSession(chatId: number, mode: Session["mode"], firstQuestion: string) {
  sessions.set(chatId, { mode, step: 0, answers: [], meta: {} });
  return firstQuestion;
}

async function finishFormLike(ctx: any, session: Session, title: string, questions: string[]) {
  const summary = questions
    .map((q, i) => (i + 1) + ") " + q + ":\n" + (session.answers[i] || "-"))
    .join("\n\n");
  sessions.delete(ctx.chat.id);
  await notifyAdmin(title, ctx, summary);
  await ctx.reply("اطلاعات شما ثبت شد ✅\nمدیر به‌زودی بررسی می‌کند.", mainMenu());
}

bot.start(async (ctx) => {
  await ctx.reply(WELCOME_MESSAGE, mainMenu());
});

bot.hears("ℹ️ درباره ما", async (ctx) => {
  const features = FEATURES.map((f) => "• " + f).join("\n") || "ثبت نشده";
  await ctx.reply(BUSINESS_NAME + "\n\nنوع ربات: " + TEMPLATE_TITLE + "\n\nامکانات فعال:\n" + features, mainMenu());
});

bot.hears("☎️ پشتیبانی", async (ctx) => {
  if (SUPPORT_CONTACT && SUPPORT_CONTACT !== "ثبت نشده") {
    await ctx.reply("راه ارتباطی پشتیبانی:\n" + SUPPORT_CONTACT, mainMenu());
  } else {
    sessions.set(ctx.chat.id, { mode: "support", step: 0, answers: [], meta: {} });
    await ctx.reply("پیام پشتیبانی خود را بنویسید تا برای مدیر ارسال شود.");
  }
});

bot.hears("💳 پرداخت", async (ctx) => {
  let text = "روش پرداخت:\n";
  if (PAYMENT_LINK) text += "پرداخت آنلاین: " + PAYMENT_LINK + "\n";
  if (CARD_NUMBER) text += "شماره کارت: " + CARD_NUMBER + "\nبه نام: " + (CARD_HOLDER || "-") + "\n";
  if (!PAYMENT_LINK && !CARD_NUMBER) text += "برای پرداخت با پشتیبانی هماهنگ کنید.";
  await ctx.reply(text, mainMenu());
});

bot.hears(["📋 خدمات", "❓ سوالات متداول", "🎓 دوره‌ها / فایل‌ها"], async (ctx) => {
  const items = linesOrFallback(["اطلاعات هنوز توسط مدیر تکمیل نشده است."]);
  await ctx.reply(items.map((item, i) => (i + 1) + ". " + item).join("\n"), mainMenu());
});

bot.hears("🛍 محصولات", async (ctx) => {
  const items = productList();
  await ctx.reply(
    "محصولات / خدمات:\n" + items.map((item, i) => (i + 1) + ". " + item).join("\n"),
    Markup.inlineKeyboard(items.slice(0, 10).map((item, i) => [Markup.button.callback("سفارش: " + item.slice(0, 35), "BUY_" + i)]))
  );
});

bot.action(/BUY_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const index = Number(ctx.match[1]);
  const item = productList()[index] || "محصول انتخاب‌شده";
  sessions.set(ctx.chat!.id, { mode: "shop", step: 0, answers: [], meta: { item } });
  await ctx.reply("برای سفارش «" + item + "» نام، شماره تماس و توضیحات ارسال را در یک پیام بفرستید.");
});

bot.hears("🧾 ثبت سفارش", async (ctx) => {
  sessions.set(ctx.chat.id, { mode: "shop", step: 0, answers: [], meta: {} });
  await ctx.reply("لطفاً نام محصول/خدمت، تعداد، شماره تماس و توضیحات را ارسال کنید.");
});

bot.hears("🎫 ثبت تیکت", async (ctx) => {
  sessions.set(ctx.chat.id, { mode: "support", step: 0, answers: [], meta: {} });
  await ctx.reply("موضوع و متن مشکل/درخواست خود را بنویسید.");
});

bot.hears("📅 رزرو نوبت", async (ctx) => {
  const question = startSession(ctx.chat.id, "reservation", "نام خدمت موردنظر، روز/ساعت پیشنهادی، نام و شماره تماس را ارسال کنید.");
  await ctx.reply(question + "\n\nخدمات:\n" + serviceList().map((s, i) => (i + 1) + ". " + s).join("\n"));
});

bot.hears("📝 ثبت سفارش خدمات", async (ctx) => {
  sessions.set(ctx.chat.id, { mode: "service", step: 0, answers: [], meta: {} });
  await ctx.reply("لطفاً نوع خدمت، توضیحات کامل، زمان موردنظر و شماره تماس را ارسال کنید.");
});

bot.hears("🧾 درخواست خرید", async (ctx) => {
  sessions.set(ctx.chat.id, { mode: "course", step: 0, answers: [], meta: {} });
  await ctx.reply("نام دوره/فایل موردنظر و شماره تماس خود را ارسال کنید.");
});

bot.hears("📝 شروع فرم", async (ctx) => {
  const questions = formQuestions();
  sessions.set(ctx.chat.id, { mode: "form", step: 0, answers: [], meta: {} });
  await ctx.reply("فرم شروع شد ✅\n\n" + questions[0]);
});

bot.hears("ℹ️ راهنما", async (ctx) => {
  await ctx.reply("برای ثبت اطلاعات روی «📝 شروع فرم» بزنید و سوال‌ها را مرحله‌به‌مرحله پاسخ دهید.", mainMenu());
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith("/")) return;

  const chatId = ctx.chat.id;
  const session = sessions.get(chatId);
  if (!session) {
    await ctx.reply("از منوی پایین یک گزینه را انتخاب کنید.", mainMenu());
    return;
  }

  if (session.mode === "form") {
    const questions = formQuestions();
    session.answers.push(text);
    session.step += 1;
    if (session.step >= questions.length) {
      await finishFormLike(ctx, session, "فرم جدید ثبت شد 📝", questions);
      return;
    }
    sessions.set(chatId, session);
    await ctx.reply(questions[session.step]);
    return;
  }

  const titles: Record<string, string> = {
    support: "تیکت پشتیبانی جدید 🎫",
    reservation: "درخواست رزرو جدید 📅",
    service: "سفارش خدمات جدید 📝",
    shop: "سفارش فروشگاهی جدید 🛍",
    course: "درخواست خرید دوره/فایل 🎓"
  };

  const selectedItem = session.meta?.item ? "آیتم انتخاب‌شده: " + session.meta.item + "\n\n" : "";
  sessions.delete(chatId);
  await notifyAdmin(titles[session.mode] || "پیام جدید", ctx, selectedItem + text);
  await ctx.reply("درخواست شما ثبت و برای مدیر ارسال شد ✅", mainMenu());
});

app.get("/health", (_req, res) => res.status(200).send("ok"));
app.get("/", (_req, res) => res.json(status));

const port = Number(process.env.PORT || 10000);
app.listen(port, "0.0.0.0", async () => {
  console.log("Listening on " + port);
  try {
    if (!token) throw new Error("CUSTOMER_BOT_TOKEN is missing");
    if (!baseUrl) throw new Error("BASE_URL is missing");
    const path = "/webhook/" + token.split(":")[0];
    app.post(path, async (req, res) => {
      try {
        await bot.handleUpdate(req.body);
        res.sendStatus(200);
      } catch (error) {
        console.error(error);
        res.sendStatus(200);
      }
    });
    await bot.telegram.setWebhook(baseUrl + path, { drop_pending_updates: true });
    status.ready = true;
    status.error = null;
    console.log("Customer bot ready");
  } catch (error) {
    status.ready = false;
    status.error = error instanceof Error ? error.message : String(error);
    console.error(error);
  }
});
