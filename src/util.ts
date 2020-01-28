import {Search} from 'jikants/dist/src/interfaces/search/Search';
import {AnimeById} from 'jikants/dist/src/interfaces/anime/ById';
import { InlineKeyboardMarkup } from 'telegraf/typings/telegram-types';
import { Markup, CallbackButton } from 'telegraf';
import moment from 'moment';
const Jikan = require('jikan-node');
const mal = new Jikan();

// declare Result type here b/c JikanTS does not export it
type Result = Search['results'][0];

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
        buttons.push(Markup.callbackButton('<', 'prev'));
    let episodeButtons = [
        Markup.callbackButton(String(start+1), String(start)),
        Markup.callbackButton(String(start+2), String(start+1)),
        Markup.callbackButton(String(start+3), String(start+2))
    ];
    const maxItems = session.search!.length - start;
    buttons.push(...episodeButtons.slice(0, maxItems));

    if (maxItems > 3)
        buttons.push(Markup.callbackButton('>', 'next'));

    return Markup.inlineKeyboard(buttons);
}

export function formatAnimes(watchlist: Anime[]): string {
    return watchlist.reduce((s, r, i) => `${s}\n${i+1}. [${r.title}](${r.url}) (${r.episode}/${r.episodeMax})`, '');
}

export function formatWatchlist(watchlist: Anime[]): string {
    if (watchlist.length > 0)
        return formatAnimes(watchlist)
    else
        return "Watchlist empty. You should weeb more 🍣";

}

export async function watchlistEntry(r: Result): Promise<Anime> {
    const anime: AnimeById = await mal.findAnime(r.mal_id);

    return {
        title_english: anime.title_english,
        title: anime.title,
        episode: 0,
        episodeMax: anime.episodes,
        url: anime.url,
        mal_id: anime.mal_id
    };
}

export interface AnimeListBotSession {
    search: Result[];
    page: number;
    watchlist: Anime[];
    finished: Anime[];
    dropped: Anime[];

}

export interface Anime {
    title_english: string;
    title: string;
    episode: number;
    episodeMax: number;
    url: string;
    mal_id: number;
}