// bot.js
import { Client as DiscordClient, GatewayIntentBits } from "discord.js";
import { Client, PollinationsAI, DeepInfra, Together, Puter, HuggingFace } from "./client.js";
import { marked } from "./marked.esm.js";

const DISCORD_TOKEN = "NzI4MDI3Mzc5NzA3OTM2ODIw.GW-bpK.HA5O9qCs6-DgzpIqMY3jjJIAIeDSq8s0pKTprQ";
const API_KEY = ""; // مفتاح API إذا عندك

const bot = new DiscordClient({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
});

// قائمة الـ providers المتاحة
const PROVIDERS = {
    pollinations: PollinationsAI,
    deepinfra: DeepInfra,
    huggingface: HuggingFace,
    together: Together,
    puter: Puter,
    azure: Client,
};

// بيانات كل مستخدم: provider, model, history
const usersData = new Map();

bot.on("ready", () => {
    console.log(`🤖 البوت جاهز! اسم البوت: ${bot.user.tag}`);
});

bot.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith("!")) return;

    const [command, ...args] = message.content.slice(1).trim().split(" ");
    const userId = message.author.id;

    if (command === "provider") {
        // أمر اختيار المزود
        const prov = args[0]?.toLowerCase();
        if (!prov || !PROVIDERS[prov]) {
            return message.reply(`⚠️ الرجاء اختيار مزود صحيح. المتاحين: ${Object.keys(PROVIDERS).join(", ")}`);
        }
        let userData = usersData.get(userId) || {};
        userData.provider = prov;
        userData.model = null; // إعادة تعيين الموديل بعد تغيير المزود
        userData.client = new PROVIDERS[prov](API_KEY ? { apiKey: API_KEY } : {});
        usersData.set(userId, userData);

        // جلب الموديلات من المزود
        try {
            const models = await userData.client.models.list();
            userData.models = models; // نخزنها عشان نستخدمها عند اختيار الموديل
            usersData.set(userId, userData);

            const modelList = models.map(m => m.id).slice(0, 10); // نعرض أول 10 موديلات فقط
            message.reply(`✅ اخترت المزود: **${prov}**\nقائمة الموديلات المتاحة (استخدم !model <اسم_الموديل>):\n${modelList.join("\n")}${models.length > 10 ? "\n...والمزيد" : ""}`);
        } catch (e) {
            console.error(e);
            message.reply("❌ حدث خطأ أثناء جلب الموديلات.");
        }
    }

    else if (command === "model") {
        // أمر اختيار الموديل
        let userData = usersData.get(userId);
        if (!userData || !userData.provider) {
            return message.reply("⚠️ اختر أولاً المزود باستخدام الأمر !provider");
        }
        const modelName = args[0];
        if (!modelName) return message.reply("⚠️ الرجاء كتابة اسم الموديل بعد الأمر !model");

        // تحقق أن الموديل ضمن القائمة
        const found = userData.models?.find(m => m.id === modelName);
        if (!found) {
            return message.reply("⚠️ الموديل غير موجود ضمن قائمة الموديلات التي تم تحميلها. تأكد من كتابته صحيحاً.");
        }

        userData.model = modelName;
        usersData.set(userId, userData);
        message.reply(`✅ تم اختيار الموديل: **${modelName}**`);
    }

    else if (command === "ask") {
        // أمر طرح السؤال
        let userData = usersData.get(userId);
        if (!userData || !userData.provider || !userData.model || !userData.client) {
            return message.reply("⚠️ الرجاء اختيار المزود والموديل أولاً باستخدام !provider ثم !model");
        }
        const prompt = args.join(" ");
        if (!prompt) return message.reply("⚠️ الرجاء كتابة السؤال بعد الأمر !ask");

        // سجل المحادثة
        if (!userData.history) userData.history = [];
        userData.history.push({ role: 'user', content: prompt });

        const replyMsg = await message.reply(`⏳ جاري التوليد باستخدام موديل **${userData.model}** من المزود **${userData.provider}**...`);

        try {
            const stream = await userData.client.chat.completions.create({
                model: userData.model,
                messages: userData.history,
                stream: true,
            });

            let fullResponse = "";
            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta?.content || "";
                fullResponse += delta;
            }
            userData.history.push({ role: 'assistant', content: fullResponse });
            usersData.set(userId, userData);

            // نرسل الرد بدون تنسيقات HTML (علامات markdown بسيطة ممكن تركها)
            await replyMsg.edit(fullResponse);
        } catch (e) {
            console.error(e);
            await replyMsg.edit("❌ حدث خطأ أثناء جلب الرد من API.");
        }
    }

    else if (command === "help") {
        message.reply(`📖 الأوامر المتاحة:
!provider <اسم_المزود>  - اختيار مزود الخدمة. المتاحين: ${Object.keys(PROVIDERS).join(", ")}
!model <اسم_الموديل>    - اختيار الموديل بعد المزود.
!ask <سؤالك>             - لطرح السؤال على الموديل المختار.
!help                    - عرض هذه الرسالة.`);
    }
});
bot.login(DISCORD_TOKEN);