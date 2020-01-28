import {Search} from 'jikants/dist/src/interfaces/search/Search';
import { ExtraReplyMessage, InlineKeyboardMarkup } from 'telegraf/typings/telegram-types';
import { Extra, Markup, CallbackButton } from 'telegraf';
import moment from 'moment';

// declare Result type here b/c JikanTS does not export it
type Result = Search['results'][0];

export function formatSearchResults(search: Search, page: number): string {
    const start = page * 3;
    const results = search.results.slice(start, start + 3);
    return results.reduce((s, r, i) => `${s}\n${start+i+1}. [${r.title}](${r.url}) (${moment(r.start_date).year()}) (${r.episodes}e)`, '');
}

export function formatSearchKeyboard(search: Search, page: number): Markup & InlineKeyboardMarkup {
    const start = page * 3;
    let buttons: CallbackButton[] = [];
    if (page > 0)
        buttons.push(Markup.callbackButton('<', 'prev'));
    let episodeButtons = [
        Markup.callbackButton(String(start+1), String(start)),
        Markup.callbackButton(String(start+2), String(start+1)),
        Markup.callbackButton(String(start+3), String(start+2))
    ];
    const maxItems = search.results.length - start;
    buttons.push(...episodeButtons.slice(0, maxItems));

    if (maxItems > 3)
        buttons.push(Markup.callbackButton('>', 'next'));

    return Markup.inlineKeyboard(buttons);
}

export function formatWatchlist(watchlist: Watchlist): string {
    if (watchlist.length > 0)
        return watchlist.reduce((s, r, i) => `${s}\n${i+1}. [${r.title}](${r.url}) (${r.episode}/${r.episodeMax})`, '');
    else
        return "Watchlist empty. You should weeb more.";

}

export function formatWatchlistEntry(anime: Result): WatchlistEntry {
    return {
        title: anime.title,
        episode: 0,
        episodeMax: anime.episodes,
        url: anime.url
    };
}

export interface AnimeListBotSession {
    search?: Search;
    page: number;
    watchlist: Watchlist
}

export type Watchlist = WatchlistEntry[];

export interface WatchlistEntry {
    title: string;
    episode: number;
    episodeMax: number;
    url: string;
}