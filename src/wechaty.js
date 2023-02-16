import {
    WechatyBuilder
} from 'wechaty';
import config from '../config.js';
import qrcodeTerminal from 'qrcode-terminal';
import fs from 'fs';
import {
    pathToFileURL
} from 'url'
import ChatGPTClient from '../src/ChatGPTClient.js';
const arg = process.argv.find((arg) => arg.startsWith('--settings'));
let path;
if (arg) {
    path = arg.split('=')[1];
} else {
    path = './settings.js';
}
let settings;
if (fs.existsSync(path)) {
    // get the full path
    const fullPath = fs.realpathSync(path);
    settings = (await import(pathToFileURL(fullPath).toString())).default;
} else {
    if (arg) {
        console.error(`Error: the file specified by the --settings parameter does not exist.`);
    } else {
        console.error(`Error: the settings.js file does not exist.`);
    }
    process.exit(1);
}
let client;

async function initChatGPT() {
    client = new ChatGPTClient(
        settings.openaiApiKey,
        settings.chatGptClient,
        settings.cacheOptions,
    );
}
let bot = {};
const startTime = new Date();
/**
 * 
 * @param {*} contact 发送对象
 * @param {*} privateContent 发言内容
 */
async function replyMessage(contact, content) {
    const {
        id: contactId
    } = contact;
    try {
        if (!content) return;
        const conversationId = null;
        const parentMessageId = null;
        const conversationSignature = null;
        const clientId = null;
        const invocationId = null;
        const onProgress = null;
        const message = await client.sendMessage(content, {
            conversationId,
            parentMessageId,
            conversationSignature,
            clientId,
            invocationId,
            onProgress,
        });
        console.log(contact);
        if (
            (contact.topic && contact?.topic() && config.groupReplyMode) ||
            (!contact.topic && config.privateReplyMode)
        ) {
            const result = content + '\n-----------\n' + message;
            await contact.say(result);
            return;
        } else {
            await contact.say(message);
        }
    } catch (e) {
        console.error(e);
        if (e.message.includes('timed out')) {
            await contact.say(
                content +
                '\n-----------\nERROR: Please try again, ChatGPT timed out for waiting response.'
            );
        }
    }
}

async function onMessage(msg) {
    // 避免重复发送
    if (msg.date() < startTime) {
        return;
    }
    const contact = msg.talker();
    const receiver = msg.to();
    const content = msg.text().trim();
    const room = msg.room();
    const alias = (await contact.alias()) || (await contact.name());
    const isText = msg.type() === bot.Message.Type.Text;
    if (msg.self()) {
        return;
    }

    if (room && isText) {
        const topic = await room.topic();
        console.log(
            `Group name: ${topic} talker: ${await contact.name()} content: ${content}`
        );

        const pattern = RegExp(`^@${receiver.name()}\\s+${config.groupKey}[\\s]*`);
        if (await msg.mentionSelf()) {
            if (!pattern.test(content)) {
                const groupContent = content.replace(pattern, '');
                replyMessage(room, groupContent);
                return;
            } else {
                console.log(
                    'Content is not within the scope of the customizition format'
                );
            }
        }
    } else if (isText) {
        console.log(`talker: ${alias} content: ${content}`);
        if (config.autoReply) {
            if (content.startsWith(config.privateKey) || config.privateKey === '') {
                let privateContent = content;
                if (config.privateKey === '') {
                    privateContent = content.substring(config.privateKey.length).trim();
                }
                replyMessage(contact, privateContent);

            } else {
                console.log(
                    'Content is not within the scope of the customizition format'
                );
            }
        }
    }
}

function onScan(qrcode) {
    qrcodeTerminal.generate(qrcode); // 在console端显示二维码
    const qrcodeImageUrl = [
        'https://api.qrserver.com/v1/create-qr-code/?data=',
        encodeURIComponent(qrcode),
    ].join('');

    console.log(qrcodeImageUrl);
}
async function onLogin(user) {
    console.log(`${user} has logged in`);
    const date = new Date();
    console.log(`Current time:${date}`);
    if (config.autoReply) {
        console.log(`Automatic robot chat mode has been activated`);
    }
}

function onLogout(user) {
    console.log(`${user} has logged out`);
}

async function onFriendShip(friendship) {
    if (friendship.type() === 2) {
        if (config.friendShipRule.test(friendship.hello())) {
            await friendship.accept();
        }
    }
}

export async function initProject() {
    try {
        await initChatGPT();
        bot = WechatyBuilder.build({
            name: 'WechatEveryDay',
            puppet: 'wechaty-puppet-wechat', // 如果有token，记得更换对应的puppet
            puppetOptions: {
                uos: true,
            },
        });

        bot
            .on('scan', onScan)
            .on('login', onLogin)
            .on('logout', onLogout)
            .on('message', onMessage);
        if (config.friendShipRule) {
            bot.on('friendship', onFriendShip);
        }

        bot
            .start()
            .then(() => console.log('Start to log in wechat...'))
            .catch((e) => console.error(e));
    } catch (error) {
        console.log('init error: ', error);
    }
}