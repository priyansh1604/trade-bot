import type { Instrument } from "kiteconnect";
import { resolveTokensBySymbol, type ResolvedInstrument } from "../zerodha/instruments";

/**
 * Nifty Midcap 150 constituents.
 *
 * SOURCE: NSE's own official index constituent file, fetched directly from
 * https://nsearchives.nseindia.com/content/indices/ind_niftymidcap150list.csv
 * on 2026-09-04. This is NSE Indices Limited's authoritative published list
 * (the same file downstream tools/screeners use), not reconstructed from
 * memory or a secondary source.
 *
 * IMPORTANT - THIS LIST GOES STALE:
 * NSE rebalances index constituents periodically (Nifty Midcap 150 is
 * reconstituted semi-annually, typically effective late March and late
 * September, based on average free-float market cap over a prior
 * reference period). This snapshot will drift from the live index over
 * time as stocks are added/removed at each rebalance. There is no logic
 * in this file to auto-refresh it - re-fetch the CSV above periodically
 * (certainly before/around each rebalance date) and regenerate this array.
 * Trading against a stale constituent list means potentially trading a
 * stock that has actually been removed from the index, or missing one
 * that was added.
 */
export interface UniverseConstituent {
  symbol: string;
  name: string;
  industry: string;
  isin: string;
}

export const NIFTY_MIDCAP_150: UniverseConstituent[] = [
  { symbol: "360ONE", name: "360 ONE WAM Ltd.", industry: "Financial Services", isin: "INE466L01038" },
  { symbol: "3MINDIA", name: "3M India Ltd.", industry: "Diversified", isin: "INE470A01017" },
  { symbol: "ACC", name: "ACC Ltd.", industry: "Construction Materials", isin: "INE012A01025" },
  { symbol: "AIAENG", name: "AIA Engineering Ltd.", industry: "Capital Goods", isin: "INE212H01026" },
  { symbol: "APLAPOLLO", name: "APL Apollo Tubes Ltd.", industry: "Capital Goods", isin: "INE702C01027" },
  { symbol: "AUBANK", name: "AU Small Finance Bank Ltd.", industry: "Financial Services", isin: "INE949L01017" },
  { symbol: "AWL", name: "AWL Agri Business Ltd.", industry: "Fast Moving Consumer Goods", isin: "INE699H01024" },
  { symbol: "ABBOTINDIA", name: "Abbott India Ltd.", industry: "Healthcare", isin: "INE358A01014" },
  { symbol: "ATGL", name: "Adani Total Gas Ltd.", industry: "Oil Gas & Consumable Fuels", isin: "INE399L01023" },
  { symbol: "ABCAPITAL", name: "Aditya Birla Capital Ltd.", industry: "Financial Services", isin: "INE674K01013" },
  { symbol: "AJANTPHARM", name: "Ajanta Pharmaceuticals Ltd.", industry: "Healthcare", isin: "INE031B01049" },
  { symbol: "ALKEM", name: "Alkem Laboratories Ltd.", industry: "Healthcare", isin: "INE540L01014" },
  { symbol: "ANTHEM", name: "Anthem Biosciences Ltd.", industry: "Healthcare", isin: "INE0CZ201020" },
  { symbol: "APARINDS", name: "Apar Industries Ltd.", industry: "Capital Goods", isin: "INE372A01015" },
  { symbol: "APOLLOTYRE", name: "Apollo Tyres Ltd.", industry: "Automobile and Auto Components", isin: "INE438A01022" },
  { symbol: "ASHOKLEY", name: "Ashok Leyland Ltd.", industry: "Capital Goods", isin: "INE208A01029" },
  { symbol: "ASTRAL", name: "Astral Ltd.", industry: "Capital Goods", isin: "INE006I01046" },
  { symbol: "AUROPHARMA", name: "Aurobindo Pharma Ltd.", industry: "Healthcare", isin: "INE406A01037" },
  { symbol: "AIIL", name: "Authum Investment & Infrastructure Ltd.", industry: "Financial Services", isin: "INE206F01022" },
  { symbol: "BSE", name: "BSE Ltd.", industry: "Financial Services", isin: "INE118H01025" },
  { symbol: "BAJAJHFL", name: "Bajaj Housing Finance Ltd.", industry: "Financial Services", isin: "INE377Y01014" },
  { symbol: "BALKRISIND", name: "Balkrishna Industries Ltd.", industry: "Automobile and Auto Components", isin: "INE787D01026" },
  { symbol: "BANKINDIA", name: "Bank of India", industry: "Financial Services", isin: "INE084A01016" },
  { symbol: "MAHABANK", name: "Bank of Maharashtra", industry: "Financial Services", isin: "INE457A01014" },
  { symbol: "BERGEPAINT", name: "Berger Paints India Ltd.", industry: "Consumer Durables", isin: "INE463A01038" },
  { symbol: "BDL", name: "Bharat Dynamics Ltd.", industry: "Capital Goods", isin: "INE171Z01026" },
  { symbol: "BHARATFORG", name: "Bharat Forge Ltd.", industry: "Automobile and Auto Components", isin: "INE465A01025" },
  { symbol: "BHEL", name: "Bharat Heavy Electricals Ltd.", industry: "Capital Goods", isin: "INE257A01026" },
  { symbol: "BHARTIHEXA", name: "Bharti Hexacom Ltd.", industry: "Telecommunication", isin: "INE343G01021" },
  { symbol: "GROWW", name: "Billionbrains Garage Ventures Ltd.", industry: "Financial Services", isin: "INE0HOQ01053" },
  { symbol: "BIOCON", name: "Biocon Ltd.", industry: "Healthcare", isin: "INE376G01013" },
  { symbol: "BLUESTARCO", name: "Blue Star Ltd.", industry: "Consumer Durables", isin: "INE472A01039" },
  { symbol: "CRISIL", name: "CRISIL Ltd.", industry: "Financial Services", isin: "INE007A01025" },
  { symbol: "COCHINSHIP", name: "Cochin Shipyard Ltd.", industry: "Capital Goods", isin: "INE704P01025" },
  { symbol: "COFORGE", name: "Coforge Ltd.", industry: "Information Technology", isin: "INE591G01025" },
  { symbol: "COLPAL", name: "Colgate Palmolive (India) Ltd.", industry: "Fast Moving Consumer Goods", isin: "INE259A01022" },
  { symbol: "CONCOR", name: "Container Corporation of India Ltd.", industry: "Services", isin: "INE111A01025" },
  { symbol: "COROMANDEL", name: "Coromandel International Ltd.", industry: "Chemicals", isin: "INE169A01031" },
  { symbol: "DABUR", name: "Dabur India Ltd.", industry: "Fast Moving Consumer Goods", isin: "INE016A01026" },
  { symbol: "DALBHARAT", name: "Dalmia Bharat Ltd.", industry: "Construction Materials", isin: "INE00R701025" },
  { symbol: "DIXON", name: "Dixon Technologies (India) Ltd.", industry: "Consumer Durables", isin: "INE935N01020" },
  { symbol: "ENDURANCE", name: "Endurance Technologies Ltd.", industry: "Automobile and Auto Components", isin: "INE913H01037" },
  { symbol: "ESCORTS", name: "Escorts Kubota Ltd.", industry: "Capital Goods", isin: "INE042A01014" },
  { symbol: "EXIDEIND", name: "Exide Industries Ltd.", industry: "Automobile and Auto Components", isin: "INE302A01020" },
  { symbol: "NYKAA", name: "FSN E-Commerce Ventures Ltd.", industry: "Consumer Services", isin: "INE388Y01029" },
  { symbol: "FEDERALBNK", name: "Federal Bank Ltd.", industry: "Financial Services", isin: "INE171A01029" },
  { symbol: "FORTIS", name: "Fortis Healthcare Ltd.", industry: "Healthcare", isin: "INE061F01013" },
  { symbol: "GVT&D", name: "GE Vernova T&D India Ltd.", industry: "Capital Goods", isin: "INE200A01026" },
  { symbol: "GMRAIRPORT", name: "GMR Airports Ltd.", industry: "Services", isin: "INE776C01039" },
  { symbol: "GICRE", name: "General Insurance Corporation of India", industry: "Financial Services", isin: "INE481Y01014" },
  { symbol: "GLAXO", name: "Glaxosmithkline Pharmaceuticals Ltd.", industry: "Healthcare", isin: "INE159A01016" },
  { symbol: "GLENMARK", name: "Glenmark Pharmaceuticals Ltd.", industry: "Healthcare", isin: "INE935A01035" },
  { symbol: "MEDANTA", name: "Global Health Ltd.", industry: "Healthcare", isin: "INE474Q01031" },
  { symbol: "GODFRYPHLP", name: "Godfrey Phillips India Ltd.", industry: "Fast Moving Consumer Goods", isin: "INE260B01028" },
  { symbol: "GODREJIND", name: "Godrej Industries Ltd.", industry: "Diversified", isin: "INE233A01035" },
  { symbol: "GODREJPROP", name: "Godrej Properties Ltd.", industry: "Realty", isin: "INE484J01027" },
  { symbol: "FLUOROCHEM", name: "Gujarat Fluorochemicals Ltd.", industry: "Chemicals", isin: "INE09N301011" },
  { symbol: "HDBFS", name: "HDB Financial Services Ltd.", industry: "Financial Services", isin: "INE756I01012" },
  { symbol: "HAVELLS", name: "Havells India Ltd.", industry: "Consumer Durables", isin: "INE176B01034" },
  { symbol: "HEROMOTOCO", name: "Hero MotoCorp Ltd.", industry: "Automobile and Auto Components", isin: "INE158A01026" },
  { symbol: "HEXT", name: "Hexaware Technologies Ltd.", industry: "Information Technology", isin: "INE093A01041" },
  { symbol: "HINDPETRO", name: "Hindustan Petroleum Corporation Ltd.", industry: "Oil Gas & Consumable Fuels", isin: "INE094A01015" },
  { symbol: "POWERINDIA", name: "Hitachi Energy India Ltd.", industry: "Capital Goods", isin: "INE07Y701011" },
  { symbol: "HONAUT", name: "Honeywell Automation India Ltd.", industry: "Capital Goods", isin: "INE671A01010" },
  { symbol: "HUDCO", name: "Housing & Urban Development Corporation Ltd.", industry: "Financial Services", isin: "INE031A01017" },
  { symbol: "ICICIGI", name: "ICICI Lombard General Insurance Company Ltd.", industry: "Financial Services", isin: "INE765G01017" },
  { symbol: "ICICIAMC", name: "ICICI Prudential Asset Management Company Ltd.", industry: "Financial Services", isin: "INE346A01027" },
  { symbol: "ICICIPRULI", name: "ICICI Prudential Life Insurance Company Ltd.", industry: "Financial Services", isin: "INE726G01019" },
  { symbol: "IDFCFIRSTB", name: "IDFC First Bank Ltd.", industry: "Financial Services", isin: "INE092T01019" },
  { symbol: "ITCHOTELS", name: "ITC Hotels Ltd.", industry: "Consumer Services", isin: "INE379A01028" },
  { symbol: "INDIANB", name: "Indian Bank", industry: "Financial Services", isin: "INE562A01011" },
  { symbol: "IRCTC", name: "Indian Railway Catering And Tourism Corporation Ltd.", industry: "Consumer Services", isin: "INE335Y01020" },
  { symbol: "IREDA", name: "Indian Renewable Energy Development Agency Ltd.", industry: "Financial Services", isin: "INE202E01016" },
  { symbol: "INDUSTOWER", name: "Indus Towers Ltd.", industry: "Telecommunication", isin: "INE121J01017" },
  { symbol: "INDUSINDBK", name: "IndusInd Bank Ltd.", industry: "Financial Services", isin: "INE095A01012" },
  { symbol: "NAUKRI", name: "Info Edge (India) Ltd.", industry: "Consumer Services", isin: "INE663F01032" },
  { symbol: "IPCALAB", name: "Ipca Laboratories Ltd.", industry: "Healthcare", isin: "INE571A01038" },
  { symbol: "JKCEMENT", name: "J.K. Cement Ltd.", industry: "Construction Materials", isin: "INE823G01014" },
  { symbol: "JSWENERGY", name: "JSW Energy Ltd.", industry: "Power", isin: "INE121E01018" },
  { symbol: "JSWINFRA", name: "JSW Infrastructure Ltd.", industry: "Services", isin: "INE880J01026" },
  { symbol: "JSL", name: "Jindal Stainless Ltd.", industry: "Metals & Mining", isin: "INE220G01021" },
  { symbol: "JUBLFOOD", name: "Jubilant Foodworks Ltd.", industry: "Consumer Services", isin: "INE797F01020" },
  { symbol: "KPRMILL", name: "K.P.R. Mill Ltd.", industry: "Textiles", isin: "INE930H01031" },
  { symbol: "KEI", name: "KEI Industries Ltd.", industry: "Capital Goods", isin: "INE878B01027" },
  { symbol: "KPITTECH", name: "KPIT Technologies Ltd.", industry: "Information Technology", isin: "INE04I401011" },
  { symbol: "KALYANKJIL", name: "Kalyan Jewellers India Ltd.", industry: "Consumer Durables", isin: "INE303R01014" },
  { symbol: "LTF", name: "L&T Finance Ltd.", industry: "Financial Services", isin: "INE498L01015" },
  { symbol: "LTTS", name: "L&T Technology Services Ltd.", industry: "Information Technology", isin: "INE010V01017" },
  { symbol: "LGEINDIA", name: "LG Electronics India Ltd.", industry: "Consumer Durables", isin: "INE324D01010" },
  { symbol: "LICHSGFIN", name: "LIC Housing Finance Ltd.", industry: "Financial Services", isin: "INE115A01026" },
  { symbol: "LAURUSLABS", name: "Laurus Labs Ltd.", industry: "Healthcare", isin: "INE947Q01028" },
  { symbol: "LENSKART", name: "Lenskart Solutions Ltd.", industry: "Consumer Services", isin: "INE956O01016" },
  { symbol: "LICI", name: "Life Insurance Corporation of India", industry: "Financial Services", isin: "INE0J1Y01017" },
  { symbol: "LINDEINDIA", name: "Linde India Ltd.", industry: "Chemicals", isin: "INE473A01011" },
  { symbol: "LLOYDSME", name: "Lloyds Metals And Energy Ltd.", industry: "Metals & Mining", isin: "INE281B01032" },
  { symbol: "LUPIN", name: "Lupin Ltd.", industry: "Healthcare", isin: "INE326A01037" },
  { symbol: "MRF", name: "MRF Ltd.", industry: "Automobile and Auto Components", isin: "INE883A01011" },
  { symbol: "M&MFIN", name: "Mahindra & Mahindra Financial Services Ltd.", industry: "Financial Services", isin: "INE774D01024" },
  { symbol: "MANKIND", name: "Mankind Pharma Ltd.", industry: "Healthcare", isin: "INE634S01028" },
  { symbol: "MARICO", name: "Marico Ltd.", industry: "Fast Moving Consumer Goods", isin: "INE196A01026" },
  { symbol: "MFSL", name: "Max Financial Services Ltd.", industry: "Financial Services", isin: "INE180A01020" },
  { symbol: "MOTILALOFS", name: "Motilal Oswal Financial Services Ltd.", industry: "Financial Services", isin: "INE338I01027" },
  { symbol: "MPHASIS", name: "MphasiS Ltd.", industry: "Information Technology", isin: "INE356A01018" },
  { symbol: "MCX", name: "Multi Commodity Exchange of India Ltd.", industry: "Financial Services", isin: "INE745G01043" },
  { symbol: "NHPC", name: "NHPC Ltd.", industry: "Power", isin: "INE848E01016" },
  { symbol: "NLCINDIA", name: "NLC India Ltd.", industry: "Power", isin: "INE589A01014" },
  { symbol: "NMDC", name: "NMDC Ltd.", industry: "Metals & Mining", isin: "INE584A01023" },
  { symbol: "NTPCGREEN", name: "NTPC Green Energy Ltd.", industry: "Power", isin: "INE0ONG01011" },
  { symbol: "NATIONALUM", name: "National Aluminium Co. Ltd.", industry: "Metals & Mining", isin: "INE139A01034" },
  { symbol: "NAM-INDIA", name: "Nippon Life India Asset Management Ltd.", industry: "Financial Services", isin: "INE298J01013" },
  { symbol: "OBEROIRLTY", name: "Oberoi Realty Ltd.", industry: "Realty", isin: "INE093I01010" },
  { symbol: "OIL", name: "Oil India Ltd.", industry: "Oil Gas & Consumable Fuels", isin: "INE274J01014" },
  { symbol: "PAYTM", name: "One 97 Communications Ltd.", industry: "Financial Services", isin: "INE982J01020" },
  { symbol: "OFSS", name: "Oracle Financial Services Software Ltd.", industry: "Information Technology", isin: "INE881D01027" },
  { symbol: "POLICYBZR", name: "PB Fintech Ltd.", industry: "Financial Services", isin: "INE417T01026" },
  { symbol: "PIIND", name: "PI Industries Ltd.", industry: "Chemicals", isin: "INE603J01030" },
  { symbol: "PAGEIND", name: "Page Industries Ltd.", industry: "Textiles", isin: "INE761H01022" },
  { symbol: "PATANJALI", name: "Patanjali Foods Ltd.", industry: "Fast Moving Consumer Goods", isin: "INE619A01035" },
  { symbol: "PERSISTENT", name: "Persistent Systems Ltd.", industry: "Information Technology", isin: "INE262H01021" },
  { symbol: "PETRONET", name: "Petronet LNG Ltd.", industry: "Oil Gas & Consumable Fuels", isin: "INE347G01014" },
  { symbol: "PHOENIXLTD", name: "Phoenix Mills Ltd.", industry: "Realty", isin: "INE211B01039" },
  { symbol: "POLYCAB", name: "Polycab India Ltd.", industry: "Capital Goods", isin: "INE455K01017" },
  { symbol: "PREMIERENE", name: "Premier Energies Ltd.", industry: "Capital Goods", isin: "INE0BS701011" },
  { symbol: "PRESTIGE", name: "Prestige Estates Projects Ltd.", industry: "Realty", isin: "INE811K01011" },
  { symbol: "RADICO", name: "Radico Khaitan Ltd", industry: "Fast Moving Consumer Goods", isin: "INE944F01028" },
  { symbol: "RVNL", name: "Rail Vikas Nigam Ltd.", industry: "Construction", isin: "INE415G01027" },
  { symbol: "SBICARD", name: "SBI Cards and Payment Services Ltd.", industry: "Financial Services", isin: "INE018E01016" },
  { symbol: "SJVN", name: "SJVN Ltd.", industry: "Power", isin: "INE002L01015" },
  { symbol: "SRF", name: "SRF Ltd.", industry: "Chemicals", isin: "INE647A01010" },
  { symbol: "SCHAEFFLER", name: "Schaeffler India Ltd.", industry: "Automobile and Auto Components", isin: "INE513A01022" },
  { symbol: "SAIL", name: "Steel Authority of India Ltd.", industry: "Metals & Mining", isin: "INE114A01011" },
  { symbol: "SUNDARMFIN", name: "Sundaram Finance Ltd.", industry: "Financial Services", isin: "INE660A01013" },
  { symbol: "SUPREMEIND", name: "Supreme Industries Ltd.", industry: "Capital Goods", isin: "INE195A01028" },
  { symbol: "SUZLON", name: "Suzlon Energy Ltd.", industry: "Capital Goods", isin: "INE040H01021" },
  { symbol: "SWIGGY", name: "Swiggy Ltd.", industry: "Consumer Services", isin: "INE00H001014" },
  { symbol: "TATACOMM", name: "Tata Communications Ltd.", industry: "Telecommunication", isin: "INE151A01013" },
  { symbol: "TATAELXSI", name: "Tata Elxsi Ltd.", industry: "Information Technology", isin: "INE670A01012" },
  { symbol: "TATAINVEST", name: "Tata Investment Corporation Ltd.", industry: "Financial Services", isin: "INE672A01026" },
  { symbol: "NIACL", name: "The New India Assurance Company Ltd.", industry: "Financial Services", isin: "INE470Y01017" },
  { symbol: "THERMAX", name: "Thermax Ltd.", industry: "Capital Goods", isin: "INE152A01029" },
  { symbol: "TORNTPOWER", name: "Torrent Power Ltd.", industry: "Power", isin: "INE813H01021" },
  { symbol: "TIINDIA", name: "Tube Investments of India Ltd.", industry: "Automobile and Auto Components", isin: "INE974X01010" },
  { symbol: "UNOMINDA", name: "UNO Minda Ltd.", industry: "Automobile and Auto Components", isin: "INE405E01023" },
  { symbol: "UPL", name: "UPL Ltd.", industry: "Chemicals", isin: "INE628A01036" },
  { symbol: "UBL", name: "United Breweries Ltd.", industry: "Fast Moving Consumer Goods", isin: "INE686F01025" },
  { symbol: "VMM", name: "Vishal Mega Mart Ltd.", industry: "Consumer Services", isin: "INE01EA01019" },
  { symbol: "IDEA", name: "Vodafone Idea Ltd.", industry: "Telecommunication", isin: "INE669E01016" },
  { symbol: "VOLTAS", name: "Voltas Ltd.", industry: "Consumer Durables", isin: "INE226A01021" },
  { symbol: "WAAREEENER", name: "Waaree Energies Ltd.", industry: "Capital Goods", isin: "INE377N01017" },
  { symbol: "YESBANK", name: "Yes Bank Ltd.", industry: "Financial Services", isin: "INE528G01035" },
];

/**
 * Resolves the Midcap 150 symbols above to real Zerodha instrument_tokens
 * using an already-fetched NSE instrument list (see zerodha/instruments.ts
 * fetchInstruments()). Reuses the same resolution logic Phase 4 uses for
 * WebSocket subscriptions, rather than duplicating it.
 */
export function resolveMidcap150Universe(instruments: Instrument[]): ResolvedInstrument[] {
  const symbols = NIFTY_MIDCAP_150.map((c) => c.symbol);
  return resolveTokensBySymbol(instruments, symbols, "NSE");
}
