import Telegraf, {ContextMessageUpdate, Extra} from 'telegraf';
import TelegrafInlineMenu from 'telegraf-inline-menu';
// import JikanTS from 'jikants';
// import MAL from 'jikan-client';
const Jikan = require('jikan-node');
const mal = new Jikan();
const {TelegrafMongoSession} = require('telegraf-session-mongodb');
import dotenv from 'dotenv';
import { formatSearchResults, formatSearchKeyboard, formatWatchlist, watchlistEntry, AnimeListBotSession, formatResult } from './util';
import { ExtraReplyMessage } from 'telegraf/typings/telegram-types';
import { Search } from 'jikants/dist/src/interfaces/search/Search';

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
        ctx.session.search = [];
        return ctx.reply("Hello, I'm the anime list bot");
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
        const search: Search = await mal.search('anime', title);
        ctx.session.search = search.results.filter(({mal_id}) => 
            !ctx.session.watchlist.some((w) => w.mal_id === mal_id));
        ctx.session.page = 0;

        if (ctx.session.search.length === 0) {
            return ctx.reply(`Sorry I could not find anything with that name ${title}`);
        } else {
            return ctx.reply(formatSearchResults(ctx.session), defaultExtra.markup(formatSearchKeyboard(ctx.session)));
        }
    });

    bot.action('next', async (ctx) => {
        ctx.session.page++;
        await ctx.editMessageText(formatSearchResults(ctx.session), defaultExtra.markup(formatSearchKeyboard(ctx.session)));
    });

    bot.action('prev', async (ctx) => {
        ctx.session.page--;
        await ctx.editMessageText(formatSearchResults(ctx.session), defaultExtra.markup(formatSearchKeyboard(ctx.session)));
    });

    bot.action(/(\d+)/, async (ctx) => {
        console.log(ctx.match);
        const index = Number.parseInt(ctx.match![1]);
        const anime = ctx.session.search[index];
        await ctx.editMessageText(`Added ${formatResult(anime)}`, defaultExtra.markup(''));
        
        ctx.session.watchlist.push(watchlistEntry(anime));
        ctx.session.page = 0;
        ctx.session.search = [];
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

