import Telegraf, { ContextMessageUpdate, Extra, Markup } from 'telegraf';
const TelegrafInlineMenu = require('telegraf-inline-menu');
// import JikanTS from 'jikants';
// import MAL from 'jikan-client';
const Jikan = require('jikan-node');
const mal = new Jikan();
const { TelegrafMongoSession } = require('telegraf-session-mongodb');
import dotenv from 'dotenv';
import { formatSearchResults, formatSearchKeyboard, watchlistEntry, AnimeListBotSession, formatResult, Anime, clamp, formatWatchlist, formatUpdates } from './util';
import { ExtraPhoto } from 'telegraf/typings/telegram-types';
import { Search } from 'jikants/dist/src/interfaces/search/Search';
import rp from 'request-promise-native';
// import { ContextFunc } from 'telegraf-inline-menu/dist/source/generic-types';

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
const botPort = Number.parseInt(assertDefined("BOT_PORT"));
const mongoConnection = assertDefined("MONGODB_URI");
const botName = assertDefined("BOT_NAME");
const wallpaperToken = assertDefined("WALLPAPER_TOKEN");
const searchLimit = Number.parseInt(process.env.SEARCH_LIMIT || '15');

const defaultExtra = Extra.markdown().webPreview(false).notifications(false);

// is there a better way to statically assure that there is a 'session' property?
declare type AnimeContext = ContextMessageUpdate & { session: AnimeListBotSession };
const telegrafOptions = {
    telegram: {
        webhookReply: false
    },
    username: botName
}
const bot: Telegraf<AnimeContext> = new Telegraf(botToken, telegrafOptions);

bot.catch((err: any) => {
    console.log(`Uncaught error: ${err}`);
})

TelegrafMongoSession.setup(bot, mongoConnection, { sessionName: 'session', unifyGroups: true }).then(() => {
    console.log('Connected to Database');

    bot.use(async (ctx, next) => {
        if (ctx.chat === undefined)
            console.warn(`Undefined chat with context ${ctx}`);
        else {
            console.log(ctx.chat);
            console.log(ctx.updateType);
            console.log(ctx.update);
        }

        //set defaults
        ctx.session.search = ctx.session.search || [];
        ctx.session.page = ctx.session.page || 0;
        ctx.session.watchlist = ctx.session.watchlist || [];
        ctx.session.finished = ctx.session.finished || [];
        ctx.session.updateIndex = ctx.session.updateIndex || 0;
        ctx.session.liveMessages = ctx.session.liveMessages || [] ;
        ctx.session.dirty = false;

        await next!();
        if (ctx.session.dirty) {
            // a.d. maybe use sth like scramjet to make filtering by promises easier https://stackoverflow.com/questions/47095019/how-to-use-array-prototype-filter-with-async
            const deleted: number[] = [];
            ctx.session.liveMessages.forEach(async (id) => {
                await ctx.telegram.editMessageText(ctx.chat!.id, id, undefined, formatWatchlist(ctx.session.watchlist), defaultExtra.markup(''))
                    .catch((err: any) => {
                        // don't care when we update without any changes
                        if (err.description.match(/message is not modified/))
                            return;
                        if (err.description.match(/message to edit not found/)) {
                            deleted.push(id);
                            return;
                        }

                        throw err;
                    });
            });
            ctx.session.liveMessages = ctx.session.liveMessages.filter((id) => deleted.includes(id));
        }
    });

    bot.start(async (ctx) => {
        ctx.session.watchlist = [];
        ctx.session.page = 0;
        ctx.session.search = [];
        ctx.session.liveMessages = [];
        ctx.session.updateIndex = 0;
        return ctx.reply("Hello, I'm the anime list bot");
    });

    bot.command('help', async (ctx) => {
        await ctx.reply('I can help organize anime watchlists. You can find me on https://gitlab.com/addapp/animelistbot\n\n/add <name> to search for a name on MAL and add it to the watchlist\n/live so that I send a watchlist message that gets live updates\n/update to update the watchlist\n/pic so that I send a picture of a random anime in the watchlist.');
    });

    bot.hears(RegExp(`^/add(@${botName})? (\\w+)$`), async (ctx) => {
        // query the myanimelist api for this title
        const title = ctx.match![2];
        // JikanTS does not work b/c of the URL constructor throwing an error. Will be fixed in version 2.0 but not released yet. maybe fix by myself
        // const search = await JikanTS.Search.search(title, "anime");
        // Jikan-client does not work b/c it uses ky which is only for the browser
        // or rather ts-node-dev does not support es6 modules
        // const search = await MAL.Search.search(title, 'anime');
        // untyped but at least if fucking works
        const search: Search = await mal.search('anime', title, { limit: searchLimit });
        ctx.session.search = search.results.filter(({ mal_id }) =>
            !ctx.session.watchlist.some((w) => w.mal_id === mal_id));
        ctx.session.page = 0;
        ctx.session.alias = title.toLowerCase();

        if (ctx.session.search.length === 0) {
            return ctx.reply(`Sorry I could not find anything with the name (${title})`);
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

    bot.action(/add_(\d+)/, async (ctx) => {
        const index = Number.parseInt(ctx.match![1]);
        const anime = ctx.session.search[index];
        await ctx.editMessageText(`Added ${formatResult(anime)}`, defaultExtra.markup(''));

        ctx.session.watchlist.push(await watchlistEntry(anime, ctx.session.alias));
        ctx.session.page = 0;
        ctx.session.search = [];
        ctx.session.dirty = true;
    });

    bot.command('show', (ctx) => {
        ctx.reply(formatWatchlist(ctx.session.watchlist), defaultExtra.markup(''));
    });

    bot.hears(/\/drop (\d+)/, async (ctx) => {
        const index = Number.parseInt(ctx.match![1]) - 1;
        if (index < 0 || index >= ctx.session.watchlist.length)
            return ctx.reply('Index not in range of watchlist 💥');

        const anime = ctx.session.watchlist[index];
        await ctx.reply(`Dropped ${anime.title}`);
        anime.dropped = true;
    });

    bot.hears(/\/watched (\d+|\w+) (-?\d+)/, async (ctx) => {
        let alias: string, index: number, anime: Anime;
        if (isNaN(Number(ctx.match![1]))) { // passed alias
            alias = ctx.match![1].toLowerCase();
            index = ctx.session.watchlist.findIndex((a) => a.alias === alias);
            if (index === -1)
                return ctx.reply(`Could not find an anime with that alias,`);
        }
        else { // passed index
            index = Number.parseInt(ctx.match![1]) - 1;

            if (index < 0 || index >= ctx.session.watchlist.length)
                return ctx.reply('Index not in range of watchlist 💥');
        }
        anime = ctx.session.watchlist[index];
        const amount = Number.parseInt(ctx.match![2]);

        anime.episode = clamp(anime.episode + amount, 0, anime.episodeMax);
        if (anime.episode >= anime.episodeMax)
            return ctx.reply(`Finished ${anime.title} 🔥`);

        return ctx.reply(`Updated ${anime.title}`);
    });

    bot.command('delete', (ctx) => {
        ctx.session.watchlist = [];
        ctx.reply('Deleted watchlist');
    });

    bot.command('pic', async (ctx) => {
        if (ctx.session.watchlist.length === 0) {
            return ctx.reply('Nothing on watchlist to get images from.');
        }

        const animeIndex = Math.floor(Math.random() * ctx.session.watchlist.length);
        const anime = ctx.session.watchlist[animeIndex];
        const title = anime.title_english.replace(/ /g, '+');
        const picAPI = `https://wall.alphacoders.com/api2.0/get.php?auth=${wallpaperToken}&method=search&term=${title}`;
        const pics = await rp.get(picAPI, { json: true });

        if (pics.success && Number.parseInt(pics.total_match) > 0) {
            // post a random image
            const imageIndex = Math.floor(Math.random() * pics.wallpapers.length);
            const imageUrl = pics.wallpapers[imageIndex].url_image;
            const imagePage = pics.wallpapers[imageIndex].url_page;
            return ctx.replyWithPhoto(imageUrl, <ExtraPhoto>defaultExtra.load({ caption: imagePage }));
        }

        return ctx.reply('Found no images 😓');
    });

    const updateMenuText = function (ctx: any): string {
        return formatUpdates(ctx.session.watchlist, ctx.session.updateIndex);
    }

    const updateMenu = new TelegrafInlineMenu(updateMenuText);
    // const updateMenuMiddleware = updateMenu.replyMenuMiddleware().middleware();
    updateMenu.setCommand('update');
    // bot.command('update', updateMenuMiddleware);

    // navigation
    updateMenu.button('⬆️', 'up', {
        doFunc: (ctx: any) => {
            ctx.session.updateIndex = clamp(ctx.session.updateIndex - 1, 0, ctx.session.watchlist.length - 1);
            ctx.answerCbQuery('');
        }
    });
    updateMenu.button('⬇️', 'down', {
        doFunc: (ctx: any) => {
            ctx.session.updateIndex = clamp(ctx.session.updateIndex + 1, 0, ctx.session.watchlist.length - 1);
            ctx.answerCbQuery('');
        },
        joinLastRow: true
    });

    // changing episode counts
    const changeMenu = new TelegrafInlineMenu(updateMenuText);
    const changeFunc = function (f: (x: number) => number): any {
        return (ctx: any) => {
            const anime: Anime = ctx.session.watchlist[ctx.session.updateIndex];
            anime.episode = clamp(f(anime.episode), 0, anime.episodeMax);
            ctx.answerCbQuery('');
        };
    }
    // a.d. possible bug, when I set the action code to something like '+3' the buttons do not work
    // is there some bullshit javascript thing going on when concating the strings?
    changeMenu.button('-3', 'm3', { doFunc: changeFunc((x => x - 3)) });
    changeMenu.button('-1', 'm1', { doFunc: changeFunc((x => x - 1)), joinLastRow: true });
    changeMenu.button('+1', 'p1', { doFunc: changeFunc((x => x + 1)), joinLastRow: true });
    changeMenu.button('+3', 'p3', { doFunc: changeFunc((x => x + 3)), joinLastRow: true });

    updateMenu.submenu('episodes', 'episodes', changeMenu, { joinLastRow: true });
    // use manual mode for exit button so that it does not try to draw the menu again afterwards since I delete the message
    updateMenu.manual('exit', 'exit');
    bot.action('upd:exit', async (ctx) => {
        // delete dropped animes
        ctx.session.watchlist = ctx.session.watchlist.filter((a: Anime) => !a.dropped);
        ctx.session.updateIndex = 0;
        ctx.session.dirty = true;
        await ctx.answerCbQuery('Updated successfully.');
        await ctx.deleteMessage().catch((err: any) => { console.log(`could not delete message ${err}`) });
    });

    updateMenu.question('url', 'url', {
        uniqueIdentifier: 'urlQuestion',
        questionText: 'Stream url for this anime?',
        setFunc: (ctx: any, answer: any) => {
            if (answer) {
                ctx.session.watchlist[ctx.session.updateIndex].stream_url = answer;
            }
        },
        joinLastRow: true,
        extraMarkup: Markup.selective(false)
    });
    updateMenu.toggle('drop', 'drop', {
        setFunc: (ctx: any, d: boolean) => {
            const anime: Anime = ctx.session.watchlist[ctx.session.updateIndex];
            anime.dropped = d;
        },
        isSetFunc: (ctx: any) => {
            const anime = ctx.session.watchlist[ctx.session.updateIndex];
            if (anime)
                return anime.dropped;
            else return false;
        },
        joinLastRow: true
    });

    // init menu
    bot.use(updateMenu.init({ backButtonText: 'back', mainMenuButtonText: 'top', actionCode: 'upd' }));

    bot.command('live', async (ctx) => {
        const { message_id } = await ctx.reply(formatWatchlist(ctx.session.watchlist), defaultExtra.markup(''));
        console.log(`Tracking: ${message_id}`)
        ctx.session.liveMessages.push(message_id);
    });

    bot.startWebhook('/anime', null, botPort);
})
    .catch((err: Error) => console.log(`Failed to connect to database: ${err}`));

