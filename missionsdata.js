// missionsdata.js – lande til banen "Flag og lande" (missioner.js). Ingen personlige data.
// Én linje pr. land: kode|navn|hovedstad|verdensdel|sværhed
//   verdensdel: E Europa · A Asien · F Afrika · N Nordamerika · S Sydamerika · O Oceanien
//   sværhed 1 (kender alle) … 4 (svær).  '-' som hovedstad = spørg ikke om hovedstaden (flere/omstridt/samme navn som landet)
// Flaget er landekoden som emoji (regionstegn) – ingen billedfiler.
const LANDE = `
DK|Danmark|København|E|1
SE|Sverige|Stockholm|E|1
NO|Norge|Oslo|E|1
FI|Finland|Helsinki|E|1
IS|Island|Reykjavik|E|1
DE|Tyskland|Berlin|E|1
GB|Storbritannien|London|E|1
FR|Frankrig|Paris|E|1
ES|Spanien|Madrid|E|1
IT|Italien|Rom|E|1
PT|Portugal|Lissabon|E|1
NL|Holland|Amsterdam|E|1
BE|Belgien|Bruxelles|E|1
PL|Polen|Warszawa|E|1
GR|Grækenland|Athen|E|1
CH|Schweiz|Bern|E|1
AT|Østrig|Wien|E|1
IE|Irland|Dublin|E|1
RU|Rusland|Moskva|E|1
UA|Ukraine|Kyiv|E|1
TR|Tyrkiet|Ankara|E|1
CZ|Tjekkiet|Prag|E|2
HU|Ungarn|Budapest|E|2
HR|Kroatien|Zagreb|E|2
RO|Rumænien|Bukarest|E|2
BG|Bulgarien|Sofia|E|2
RS|Serbien|Beograd|E|2
SK|Slovakiet|Bratislava|E|2
SI|Slovenien|Ljubljana|E|2
EE|Estland|Tallinn|E|2
LV|Letland|Riga|E|2
LT|Litauen|Vilnius|E|2
LU|Luxembourg|-|E|2
AL|Albanien|Tirana|E|2
BA|Bosnien-Hercegovina|Sarajevo|E|2
BY|Belarus|Minsk|E|2
CY|Cypern|Nicosia|E|2
MT|Malta|Valletta|E|2
ME|Montenegro|Podgorica|E|3
MK|Nordmakedonien|Skopje|E|3
XK|Kosovo|Pristina|E|3
MD|Moldova|Chisinau|E|3
MC|Monaco|-|E|3
AD|Andorra|-|E|3
LI|Liechtenstein|Vaduz|E|3
SM|San Marino|-|E|3
VA|Vatikanstaten|-|E|3
CN|Kina|Beijing|A|1
JP|Japan|Tokyo|A|1
IN|Indien|New Delhi|A|1
KR|Sydkorea|Seoul|A|1
TH|Thailand|Bangkok|A|1
SA|Saudi-Arabien|Riyadh|A|1
IL|Israel|-|A|1
KP|Nordkorea|Pyongyang|A|2
VN|Vietnam|Hanoi|A|2
ID|Indonesien|Jakarta|A|2
PH|Filippinerne|Manila|A|2
MY|Malaysia|Kuala Lumpur|A|2
SG|Singapore|-|A|2
PK|Pakistan|Islamabad|A|2
NP|Nepal|Kathmandu|A|2
AF|Afghanistan|Kabul|A|2
IR|Iran|Teheran|A|2
IQ|Irak|Bagdad|A|2
AE|Forenede Arabiske Emirater|Abu Dhabi|A|2
QA|Qatar|Doha|A|2
LB|Libanon|Beirut|A|2
SY|Syrien|Damaskus|A|2
KZ|Kasakhstan|Astana|A|2
MN|Mongoliet|Ulaanbaatar|A|2
BD|Bangladesh|Dhaka|A|3
LK|Sri Lanka|-|A|3
BT|Bhutan|Thimphu|A|3
MV|Maldiverne|Malé|A|3
KW|Kuwait|-|A|3
BH|Bahrain|Manama|A|3
OM|Oman|Muscat|A|3
YE|Yemen|Sanaa|A|3
PS|Palæstina|-|A|3
JO|Jordan|Amman|A|3
UZ|Usbekistan|Tasjkent|A|3
MM|Myanmar|Naypyidaw|A|3
KH|Cambodja|Phnom Penh|A|3
LA|Laos|Vientiane|A|3
GE|Georgien|Tbilisi|A|3
AM|Armenien|Jerevan|A|3
AZ|Aserbajdsjan|Baku|A|3
TW|Taiwan|Taipei|A|3
TM|Turkmenistan|Asjkhabad|A|4
KG|Kirgisistan|Bisjkek|A|4
TJ|Tadsjikistan|Dusjanbe|A|4
BN|Brunei|Bandar Seri Begawan|A|4
TL|Østtimor|Dili|A|4
EG|Egypten|Kairo|F|1
ZA|Sydafrika|-|F|1
MA|Marokko|Rabat|F|1
NG|Nigeria|Abuja|F|2
KE|Kenya|Nairobi|F|2
ET|Etiopien|Addis Ababa|F|2
GH|Ghana|Accra|F|2
SN|Senegal|Dakar|F|2
DZ|Algeriet|Algier|F|2
TN|Tunesien|Tunis|F|2
CM|Cameroun|Yaoundé|F|2
CI|Elfenbenskysten|Yamoussoukro|F|2
LY|Libyen|Tripoli|F|3
SD|Sudan|Khartoum|F|3
TZ|Tanzania|Dodoma|F|3
UG|Uganda|Kampala|F|3
ML|Mali|Bamako|F|3
CD|DR Congo|Kinshasa|F|3
AO|Angola|Luanda|F|3
ZM|Zambia|Lusaka|F|3
ZW|Zimbabwe|Harare|F|3
MZ|Mozambique|Maputo|F|3
BW|Botswana|Gaborone|F|3
NA|Namibia|Windhoek|F|3
MG|Madagaskar|Antananarivo|F|3
RW|Rwanda|Kigali|F|3
SO|Somalia|Mogadishu|F|3
SS|Sydsudan|Juba|F|4
NE|Niger|Niamey|F|4
TD|Tchad|N'Djamena|F|4
BF|Burkina Faso|Ouagadougou|F|4
GN|Guinea|Conakry|F|4
GW|Guinea-Bissau|-|F|4
SL|Sierra Leone|Freetown|F|4
LR|Liberia|Monrovia|F|4
TG|Togo|Lomé|F|4
BJ|Benin|Porto-Novo|F|4
MR|Mauretanien|Nouakchott|F|4
GM|Gambia|Banjul|F|4
CV|Kap Verde|Praia|F|4
CG|Congo|Brazzaville|F|4
GA|Gabon|Libreville|F|4
GQ|Ækvatorialguinea|Malabo|F|4
CF|Centralafrikanske Republik|Bangui|F|4
MW|Malawi|Lilongwe|F|4
LS|Lesotho|Maseru|F|4
SZ|Eswatini|Mbabane|F|4
MU|Mauritius|Port Louis|F|4
SC|Seychellerne|Victoria|F|4
KM|Comorerne|Moroni|F|4
BI|Burundi|Gitega|F|4
DJ|Djibouti|-|F|4
ER|Eritrea|Asmara|F|4
ST|São Tomé og Príncipe|-|F|4
US|USA|Washington D.C.|N|1
CA|Canada|Ottawa|N|1
MX|Mexico|-|N|1
CU|Cuba|Havana|N|2
JM|Jamaica|Kingston|N|2
HT|Haiti|Port-au-Prince|N|3
DO|Dominikanske Republik|Santo Domingo|N|3
GT|Guatemala|-|N|3
HN|Honduras|Tegucigalpa|N|3
SV|El Salvador|-|N|3
NI|Nicaragua|Managua|N|3
CR|Costa Rica|San José|N|3
PA|Panama|-|N|3
BS|Bahamas|Nassau|N|3
BZ|Belize|Belmopan|N|4
BB|Barbados|Bridgetown|N|4
TT|Trinidad og Tobago|Port of Spain|N|4
AG|Antigua og Barbuda|St. John's|N|4
DM|Dominica|Roseau|N|4
GD|Grenada|St. George's|N|4
KN|Saint Kitts og Nevis|Basseterre|N|4
LC|Saint Lucia|Castries|N|4
VC|Saint Vincent og Grenadinerne|Kingstown|N|4
BR|Brasilien|Brasília|S|1
AR|Argentina|Buenos Aires|S|1
CL|Chile|Santiago|S|2
CO|Colombia|Bogotá|S|2
PE|Peru|Lima|S|2
UY|Uruguay|Montevideo|S|2
VE|Venezuela|Caracas|S|2
PY|Paraguay|Asunción|S|3
BO|Bolivia|-|S|3
EC|Ecuador|Quito|S|3
GY|Guyana|Georgetown|S|4
SR|Surinam|Paramaribo|S|4
AU|Australien|Canberra|O|1
NZ|New Zealand|Wellington|O|1
PG|Papua Ny Guinea|Port Moresby|O|3
FJ|Fiji|Suva|O|3
WS|Samoa|Apia|O|4
TO|Tonga|Nuku'alofa|O|4
VU|Vanuatu|Port Vila|O|4
SB|Salomonøerne|Honiara|O|4
KI|Kiribati|Tarawa|O|4
FM|Mikronesien|Palikir|O|4
MH|Marshalløerne|Majuro|O|4
PW|Palau|Ngerulmud|O|4
NR|Nauru|-|O|4
TV|Tuvalu|Funafuti|O|4
`.trim().split('\n').map(l => { const [kode, navn, hoved, del, tier] = l.split('|'); return { kode, navn, hoved: hoved === '-' ? null : hoved, del, tier: Number(tier) }; });
const LAND = Object.fromEntries(LANDE.map(l => [l.kode, l]));

// Flag, der ligner hinanden – bruges som forkerte svar på de høje niveauer
const LIGNER = [
  ['ID', 'MC', 'PL'], ['RO', 'TD', 'AD', 'MD'], ['IE', 'CI', 'IT', 'IN', 'NE'], ['NL', 'LU', 'HR', 'PY'], ['RU', 'SK', 'SI', 'RS'],
  ['AU', 'NZ', 'FJ', 'TV'], ['ML', 'GN', 'SN', 'CM'], ['CO', 'EC', 'VE'], ['NO', 'IS', 'DK'], ['HN', 'SV', 'NI', 'AR', 'GT'],
  ['QA', 'BH'], ['GH', 'BO', 'ET', 'LT'], ['BE', 'DE'], ['AT', 'LV', 'PE', 'LB'], ['SE', 'UA'], ['FI', 'GR'], ['FR', 'NL', 'RU'],
  ['EG', 'SY', 'IQ', 'YE'], ['JO', 'PS', 'SD', 'KW', 'AE'], ['TR', 'TN', 'MA'], ['EE', 'BW', 'SL'], ['HU', 'BG', 'IT', 'IR', 'TJ'],
  ['US', 'LR', 'MY'], ['CL', 'CU', 'TG'], ['CR', 'TH'], ['JP', 'BD', 'PW'], ['CN', 'VN', 'MA'], ['BF', 'GW', 'BJ', 'GH'], ['SO', 'FM'],
  ['CH', 'DK', 'GE', 'TO'], ['MX', 'IT'], ['CD', 'CG'], ['GB', 'AU', 'NZ'], ['KE', 'MW', 'SS'], ['ZA', 'VU', 'GY'], ['PT', 'BD'],
  ['SG', 'ID', 'PL'], ['UY', 'GR', 'AR'], ['NG', 'IE'], ['ZM', 'ZW'], ['KZ', 'PW', 'SE'], ['AM', 'CO', 'LT'], ['AZ', 'UZ'], ['KG', 'CN']
];
