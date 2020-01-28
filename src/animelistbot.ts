import Telegraf, {ContextMessageUpdate, Extra} from 'telegraf';
import TelegrafInlineMenu from 'telegraf-inline-menu';
// import JikanTS from 'jikants';
// import MAL from 'jikan-client';
const Jikan = require('jikan-node');
const mal = new Jikan();
const {TelegrafMongoSession} = require('telegraf-session-mongodb');
import dotenv from 'dotenv';
import { formatSearchResults, formatSearchKeyboard, formatWatchlist, formatWatchlistEntry, AnimeListBotSession } from './util';
import { ExtraReplyMessage } from 'telegraf/typings/telegram-types';
import { AssertionError } from 'assert';

dotenv.config();

function assertDefined(name: string): string {
    const val = process.env[name];
    if (val === undefined) {
        console.error(`Need ${name} env variable!`);
        process.exit(1);
    }
    return val;
}
const token = assertDefined("BOT_TOKEN");
const mongoConnection = assertDefined("MONGODB_URI");
const botName = assertDefined("BOT_NAME");

const defaultExtra = Extra.markdown().webPreview(false).notifications(false);

// is there a better way to statically assure that there is a 'session' property?
const bot: Telegraf<ContextMessageUpdate & { session: AnimeListBotSession }> = new Telegraf(token, { username: botName });

TelegrafMongoSession.setup(bot, mongoConnection, { sessionName: 'session' })
.then(() => {
    bot.start(async (ctx) => {
        ctx.session.watchlist = [];
        ctx.session.page = 0;
        await ctx.reply("Hello, I'm the anime list bot");
    }); 
    bot.command("test", Telegraf.reply("Successful test"));

    bot.hears(/\/add (\w+)/, async (ctx) => {
        // query the myanimelist api for this title
        const title = ctx.match![1];
        console.log(title);
        // JikanTS does not work b/c of the URL constructor throwing an error. Will be fixed in version 2.0 but not released yet. maybe fix by myself
        // const search = await JikanTS.Search.search(title, "anime");
        // Jikan-client does not work b/c it uses ky which is only for the browser
        // or rather ts-node-dev does not support es6 modules
        // const search = await MAL.Search.search(title, 'anime');
        // untyped but at least if fucking works
        ctx.session.search = await mal.search('anime', title);
        ctx.session.page = 0;

        if (ctx.session.search === undefined) {
            await ctx.reply(`Sorry I could not find anything with that name ${title}`);
        } else {
            await ctx.reply(formatSearchResults(ctx.session.search, ctx.session.page), defaultExtra.markup(formatSearchKeyboard(ctx.session.search, ctx.session.page)));
        }
    });

    bot.action('next', async (ctx) => {
        const search = ctx.session.search!;
        const page = ctx.session.page + 1;

        await ctx.editMessageText(formatSearchResults(search, page), defaultExtra.markup(formatSearchKeyboard(search, page)));
        ctx.session.page = page;
    });

    bot.action('prev', async (ctx) => {
        const search = ctx.session.search!;
        const page = ctx.session.page - 1;

        await ctx.editMessageText(formatSearchResults(search, page), defaultExtra.markup(formatSearchKeyboard(search, page)));
        ctx.session.page = page;
    });

    bot.action(/(\d+)/, async (ctx) => {
        console.log(ctx.match);
        const search = ctx.session.search!;
        const index = Number.parseInt(ctx.match![1]);
        const anime = search.results[index];
        await ctx.answerCbQuery(`Added ${anime.title}`);
        await ctx.editMessageReplyMarkup();
        
        ctx.session.watchlist.push(formatWatchlistEntry(anime));
        ctx.session.page = 0;
        ctx.session.search = undefined;
    });

    bot.command('show', (ctx) => {
        let s: ExtraReplyMessage
        ctx.reply(formatWatchlist(ctx.session.watchlist), defaultExtra.markup(''));
    });

    bot.hears(/\/drop (\d+)/, async (ctx) => {
        const index = Number.parseInt(ctx.match![1]) - 1;
        if (index < 0 || index >= ctx.session.watchlist.length)
            return ctx.reply('Index not in range of watchlist.');

        const anime = ctx.session.watchlist.splice(index, 1)[0];
        ctx.reply(`Dropped ${anime.title}`);
    });

    bot.hears(/\/watched (\d+) (\d+)/, async (ctx) => {
        const index = Number.parseInt(ctx.match![1]) - 1;
        const amount = Number.parseInt(ctx.match![2]);
        if (index < 0 || index >= ctx.session.watchlist.length)
            return ctx.reply('Index not in range of watchlist.');

        const anime = ctx.session.watchlist[index];
        anime.episode += amount;
        if (anime.episode >= anime.episodeMax) {
            anime.episode = anime.episodeMax;
            ctx.reply(`Finished ${anime.title}`);
        }

        ctx.reply(`Updated ${anime.title}`);
    });

    bot.command('delete', (ctx) => {
        ctx.session.watchlist = [];
        ctx.reply('Deleted watchlist');
    });

    bot.startWebhook('/anime', null, 5000);
})
.catch((err: Error) => console.log(`Failed to connect to database: ${err}`));

