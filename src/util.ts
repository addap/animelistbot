import {Search} from 'jikants/dist/src/interfaces/search/Search';
import {AnimeById} from 'jikants/dist/src/interfaces/anime/ById';
import { InlineKeyboardMarkup } from 'telegraf/typings/telegram-types';
import { Markup, CallbackButton, ContextMessageUpdate } from 'telegraf';
import moment from 'moment';
const Jikan = require('jikan-node');
const mal = new Jikan();

// declare Result type here b/c JikanTS does not export it
type Result = Search['results'][0];

const finished = (a: Anime) => a.episode === a.episodeMax;

export function formatSearchResults(session: AnimeListBotSession): string {
    const start = session.page * 3;
    const results = session.search!.slice(start, start + 3);
    return results.reduce((s, r, i) => `${s}\n${start+i+1}. ${formatResult(r)}`, '');
}

export function formatResult(r: Result): string {
    return `[${r.title}](${r.url}) (${moment(r.start_date).year()}) (${r.episodes}e)`
}

export function formatSearchKeyboard(session: AnimeListBotSession): Markup & InlineKeyboardMarkup {
    // filter out animes already on the watchlist
    const start = session.page * 3;
    let buttons: CallbackButton[] = [];
    if (session.page > 0)
        buttons.push(Markup.callbackButton('<', 'add_prev'));
    let episodeButtons = [
        Markup.callbackButton(String(start+1), `add_${String(start)}`),
        Markup.callbackButton(String(start+2), `add_${String(start+1)}`),
        Markup.callbackButton(String(start+3), `add_${String(start+2)}`)
    ];
    const maxItems = session.search!.length - start;
    buttons.push(...episodeButtons.slice(0, maxItems));

    if (maxItems > 3)
        buttons.push(Markup.callbackButton('>', 'add_next'));

    return Markup.inlineKeyboard([buttons, [Markup.callbackButton('exit', 'add_exit')]]);
}

function status(a: Anime): string {
    if (finished(a))
        return '🏁';
    else if (a.dropped)
        return '💩';
    else
        return '';
        return '⏳';
}

function formatAnimesUpdate(watchlist: Anime[], index: number): string {
    return watchlist.reduce((s, r, i) => `${s}\n${i === index ? '*':''}${i+1}. ${status(r)} ${r.title}(${r.episode}/${r.episodeMax})${i === index ? '*':''}`, '');
}

// format the watchlist when they are updated
export function formatUpdates(watchlist: Anime[], index: number): string {
    if (watchlist.length > 0)
        return formatAnimesUpdate(watchlist, index);
    else
        return "Watchlist empty. You should weeb more 🇯🇵🍣";
}

function formatAnimes(watchlist: Anime[]): string {
    return watchlist.reduce((s, r, i) => `${s}\n${i+1}. ${status(r)} [${r.title}](${r.stream_url ? r.stream_url : r.url}) (${r.episode}/${r.episodeMax})`, '');
}

// formatting a watchlist just for viewing so we don't show finished animes
export function formatWatchlist(watchlist: Anime[]): string {
    const filtered = watchlist.filter((a) => !finished(a));

    if (filtered.length > 0)
        return formatAnimes(watchlist);
    else
        return "Watchlist empty. You should weeb more 🇯🇵🍣";
}

export async function watchlistEntry(r: Result): Promise<Anime> {
    const anime: AnimeById = await mal.findAnime(r.mal_id);

    return {
        title_english: anime.title_english,
        title: anime.title,
        episode: 0,
        episodeMax: anime.episodes,
        url: anime.url,
        mal_id: anime.mal_id,
        dropped: false
    };
}

export function clamp(x: number, min: number, max: number): number {
    return Math.min(max, Math.max(x, min));
}

export interface AnimeListBotSession {
    search: Result[];
    page: number;
    watchlist: Anime[];
    finished: Anime[];
    updateIndex: number;
    updateUrl: false;
    liveMessages: number[];
    dirty: boolean;
}

export interface Anime {
    title_english: string;
    title: string;
    episode: number;
    episodeMax: number;
    url: string;
    stream_url?: string;
    mal_id: number;
    dropped: boolean;
}