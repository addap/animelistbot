import Telegraf, {ContextMessageUpdate, Extra} from 'telegraf';
import TelegrafInlineMenu from 'telegraf-inline-menu';
// import JikanTS from 'jikants';
// import MAL from 'jikan-client';
const Jikan = require('jikan-node');
const mal = new Jikan();
const {TelegrafMongoSession} = require('telegraf-session-mongodb');
import dotenv from 'dotenv';
import { formatSearchResults, formatSearchKeyboard, formatAnimes, watchlistEntry, AnimeListBotSession, formatResult } from './util';
import { ExtraReplyMessage, ExtraPhoto } from 'telegraf/typings/telegram-types';
import { Search } from 'jikants/dist/src/interfaces/search/Search';
import rp from 'request-promise-native';
import { REPL_MODE_SLOPPY } from 'repl';

dotenv.config();

function assertDefined(name: string): string {
    const val = process.env[name];
    if (val === undefined) {
        console.error(`Need ${name} env variable!`);
        process.exit(1);
    }
    return val;
}
const botToken = assertDefined("BOT_TOKEN");
const mongoConnection = assertDefined("MONGODB_URI");
const botName = assertDefined("BOT_NAME");
const wallpaperToken = assertDefined("WALLPAPER_TOKEN");
const searchLimit = Number.parseInt(process.env.SEARCH_LIMIT || '15');

const defaultExtra = Extra.markdown().webPreview(false).notifications(false);

// is there a better way to statically assure that there is a 'session' property?
const bot: Telegraf<ContextMessageUpdate & { session: AnimeListBotSession }> = new Telegraf(botToken, { username: botName });

TelegrafMongoSession.setup(bot, mongoConnection, { sessionName: 'session' })
.then(() => {
    bot.start(async (ctx) => {
        ctx.session.watchlist = [];
        ctx.session.dropped = [];
        ctx.session.finished = [];
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
        const search: Search = await mal.search('anime', title, { limit: searchLimit });
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
        const index = Number.parseInt(ctx.match![1]);
        const anime = ctx.session.search[index];
        await ctx.editMessageText(`Added ${formatResult(anime)}`, defaultExtra.markup(''));
        
        ctx.session.watchlist.push(await watchlistEntry(anime));
        ctx.session.page = 0;
        ctx.session.search = [];
    });

    bot.command('show', (ctx) => {
        let s: ExtraReplyMessage
        ctx.reply(formatAnimes(ctx.session.watchlist), defaultExtra.markup(''));
    });

    bot.hears(/\/drop (\d+)/, async (ctx) => {
        const index = Number.parseInt(ctx.match![1]) - 1;
        if (index < 0 || index >= ctx.session.watchlist.length)
            return ctx.reply('Index not in range of watchlist 💥');
        
        const anime = ctx.session.watchlist.splice(index, 1)[0];
        await ctx.reply(`Dropped ${anime.title}`);
        ctx.session.dropped.push(anime);
    });

    bot.hears(/\/watched (\d+) (\d+)/, async (ctx) => {
        const index = Number.parseInt(ctx.match![1]) - 1;
        const amount = Number.parseInt(ctx.match![2]);
        if (index < 0 || index >= ctx.session.watchlist.length)
            return ctx.reply('Index not in range of watchlist 💥');

        const anime = ctx.session.watchlist[index];
        anime.episode += amount;
        if (anime.episode >= anime.episodeMax) {
            await ctx.reply(`Finished ${anime.title} 🔥`);

            // remove anime from watchlist and put into finished list
            anime.episode = anime.episodeMax;
            ctx.session.watchlist.splice(index, 1);
            ctx.session.finished.push(anime);
        }

        ctx.reply(`Updated ${anime.title}`);
    });

    bot.command('delete', (ctx) => {
        ctx.session.watchlist = [];
        ctx.reply('Deleted watchlist');
    });

    // bot.command('dropped', (ctx) => {
    //     ctx.reply(formatAn)
    // });

    bot.hears(/\/pic/, async (ctx) => {
        if (ctx.session.watchlist.length === 0) {
            return ctx.reply('Nothing on watchlist to get images from 😠😠😠');
        }

        const animeIndex = Math.floor(Math.random() * ctx.session.watchlist.length);
        const anime = ctx.session.watchlist[animeIndex];
        const title = anime.title_english.replace(/ /g, '+');
        const picAPI = `https://wall.alphacoders.com/api2.0/get.php?auth=${wallpaperToken}&method=search&term=${title}`;
        const pics = await rp.get(picAPI, {json: true});

        if (pics.success && Number.parseInt(pics.total_match) > 0) {
            // post a random image
            const imageIndex = Math.floor(Math.random() * pics.wallpapers.length);
            const imageUrl = pics.wallpapers[imageIndex].url_image;
            const imagePage = pics.wallpapers[imageIndex].url_page;
            return ctx.replyWithPhoto(imageUrl, <ExtraPhoto>defaultExtra.load({caption: imagePage}));
        }
        
        return ctx.reply('Found no images 😓');
    });

    bot.startWebhook('/anime', null, 5000);
})
.catch((err: Error) => console.log(`Failed to connect to database: ${err}`));

