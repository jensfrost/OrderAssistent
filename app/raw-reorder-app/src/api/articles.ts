import { apiGet } from './client';

export type Article = {
  ARARTN: string;
  ARNAMN: string;
  ARTYPNR: string;
  ARENHET?: string;
};

export function fetchArticles() {
  return apiGet<Article[]>('artReg');
}