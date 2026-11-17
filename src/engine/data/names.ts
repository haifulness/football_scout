/** Name pools per culture. Space-separated to keep the file compact. */
interface Culture {
  first: string;
  last: string;
  /** Club name patterns; {c} is replaced by the city name. */
  clubs: string[];
  stadium: string[];
}

const C: Record<string, Culture> = {
  english: {
    first:
      'Jack Harry Oliver George Charlie James Thomas Ben Callum Lewis Kieran Ryan Connor Jordan Danny Tom Sam Josh Luke Alfie Ethan Mason Reece Jamie Liam Nathan Owen Kyle Marcus Jacob Aaron Declan Jake Tyler Cole Bailey Rhys Max Finley Toby',
    last: 'Smith Jones Taylor Brown Wilson Walker Wright Thompson Robinson Hughes Edwards Green Hall Wood Harris Clarke Lewis Jackson Turner Hill Moore Cooper Ward Morris Baker Bell Parker Bennett Shaw Fletcher Holmes Mills Webb Barnes Rowe Doyle Henderson Mason Barker Chapman Dawson Hartley Kemp Lowe Marsh Nolan Pearce',
    clubs: [
      '{c} United',
      '{c} Town',
      '{c} City',
      '{c} Rovers',
      '{c} Athletic',
      '{c} Wanderers',
      '{c} Albion',
      '{c} FC',
      '{c} Borough',
      '{c} Rangers',
      '{c} County',
      '{c} Argyle',
      '{c} Harriers',
    ],
    stadium: [
      '{c} Park',
      'The {c} Road Ground',
      'Victoria Park',
      'Kingsway',
      'The Meadow',
      'Riverside Stadium',
      'Memorial Ground',
      'Castle Lane',
      'The Old Foundry',
      'Millfield',
    ],
  },
  spanish: {
    first:
      'Pablo Sergio Javier Alejandro Diego Carlos Marcos Iker Álvaro Hugo Daniel Adrián Raúl Rubén Mateo Santiago Nicolás Facundo Thiago Lautaro Gonzalo Joaquín Emiliano Luis Andrés Felipe Cristian Kevin Brian Rodrigo Manuel Héctor Iván Unai Jorge',
    last: 'García Rodríguez Martínez López Sánchez Pérez Gómez Fernández Díaz Morales Romero Torres Ramírez Herrera Castro Vargas Ruiz Ortega Silva Navarro Molina Delgado Rojas Medina Vega Suárez Aguirre Castillo Paredes Cabrera Ibáñez Benítez Acosta Ríos Flores Mendoza Cortés Quintero Salazar Peña',
    clubs: [
      'Real {c}',
      'Deportivo {c}',
      'Atlético {c}',
      'CD {c}',
      'Club {c}',
      'Racing {c}',
      'UD {c}',
      'Sporting {c}',
      'CF {c}',
      'Unión {c}',
      'Independiente {c}',
    ],
    stadium: [
      'Estadio Municipal de {c}',
      'Estadio La Ribera',
      'Campo del Prado',
      'Estadio El Sol',
      'Estadio Nuevo {c}',
      'Estadio San Martín',
      'Estadio La Ciudadela',
    ],
  },
  portuguese: {
    first:
      'João Pedro Rafael Tiago Diogo Gonçalo Rúben André Bruno Nuno Lucas Gabriel Matheus Vinícius Gustavo Felipe Thiago Rodrigo Caio Igor Renan Wesley Danilo Éverton Marcos Leandro Fábio Hugo Vitor Luan',
    last: 'Silva Santos Ferreira Pereira Oliveira Costa Rodrigues Martins Sousa Fernandes Gonçalves Gomes Lopes Marques Alves Almeida Ribeiro Pinto Carvalho Teixeira Moreira Correia Mendes Nunes Soares Barbosa Cardoso Rocha Araújo Monteiro',
    clubs: ['SC {c}', '{c} FC', 'Clube {c}', 'Atlético {c}', 'Esporte Clube {c}', 'União {c}', 'Desportivo de {c}', 'Grêmio {c}', 'Sport {c}'],
    stadium: ['Estádio Municipal de {c}', 'Estádio do Bonfim', 'Arena {c}', 'Estádio da Luz Nova', 'Estádio São Jorge', 'Estádio do Mar'],
  },
  german: {
    first:
      'Lukas Leon Jonas Felix Maximilian Paul Niklas Tim Jan Florian Tobias Kevin Marco Julian Fabian David Moritz Philipp Simon Dominik Kai Timo Mats Lennart Joshua Robin Elias Benedikt Luca Nico',
    last: 'Müller Schmidt Schneider Fischer Weber Meyer Wagner Becker Schulz Hoffmann Koch Richter Klein Wolf Schröder Neumann Schwarz Zimmermann Braun Krüger Hartmann Lange Werner Krause Lehmann Köhler Kaiser Fuchs Vogel Brandt Keller Frank Berger Winter Roth',
    clubs: [
      'FC {c}',
      'SV {c}',
      'VfB {c}',
      'TSV {c}',
      'SC {c}',
      'Borussia {c}',
      '1. FC {c}',
      'Eintracht {c}',
      'VfL {c}',
      'SpVgg {c}',
      'Fortuna {c}',
      'Union {c}',
    ],
    stadium: ['{c} Arena', 'Waldstadion', 'Stadion am Ring', 'Sportpark {c}', 'Ostseestadion', 'Stadion an der Alten Försterei', 'Bergstadion'],
  },
  italian: {
    first:
      'Lorenzo Alessandro Matteo Francesco Andrea Leonardo Federico Riccardo Gabriele Marco Nicolò Davide Simone Giacomo Tommaso Luca Stefano Daniele Christian Mattia Alberto Filippo Manuel Gianluca Pietro',
    last: 'Rossi Russo Ferrari Esposito Bianchi Romano Colombo Ricci Marino Greco Bruno Gallo Conti De Luca Costa Giordano Mancini Rizzo Lombardi Moretti Barbieri Fontana Santoro Mariani Rinaldi Caruso Ferrara Galli Martini Leone Longo Gentile Vitale Serra',
    clubs: ['AC {c}', 'US {c}', '{c} Calcio', 'SS {c}', 'FC {c}', 'Atletico {c}', 'Virtus {c}', 'Real {c}', 'Pro {c}', 'Unione Sportiva {c}'],
    stadium: ['Stadio Comunale di {c}', 'Stadio del Porto', 'Stadio Carlo Bassi', 'Stadio San Paolo Nuovo', 'Stadio dei Pini', 'Arena {c}'],
  },
  french: {
    first:
      'Lucas Hugo Théo Nathan Louis Enzo Mathis Maxime Antoine Thomas Clément Alexandre Quentin Romain Florian Kylian Ousmane Moussa Yanis Rayan Adrien Benjamin Jules Baptiste Corentin Samuel Wissam Ibrahima Mamadou Kévin',
    last: 'Martin Bernard Dubois Thomas Robert Richard Petit Durand Leroy Moreau Simon Laurent Lefebvre Michel Garcia David Bertrand Roux Vincent Fournier Morel Girard André Mercier Dupont Lambert Bonnet François Martinez Legrand Garnier Faure Rousseau Blanc Guerin Diallo Traoré Camara Koné',
    clubs: ['FC {c}', 'AS {c}', 'Olympique {c}', 'Stade {c}', 'RC {c}', 'US {c}', 'SC {c}', 'En Avant {c}', 'Racing Club de {c}', 'AJ {c}'],
    stadium: ['Stade Municipal de {c}', 'Stade de la Route', 'Stade du Moustoir Neuf', 'Stade des Alpes Nouvelles', 'Stade Léo Brun', 'Parc de {c}'],
  },
  dutch: {
    first:
      'Daan Sem Lucas Levi Finn Milan Jesse Thijs Luuk Bram Tim Stijn Ruben Jens Lars Teun Joey Kenneth Wout Jurriën Ryan Mats Noa Xavi Quinten Kees Dirk Hidde Jasper Pieter',
    last: 'de Jong Jansen de Vries van den Berg van Dijk Bakker Janssen Visser Smit Meijer de Boer Mulder de Groot Bos Vos Peters Hendriks van Leeuwen Dekker Brouwer de Wit Dijkstra Smits de Graaf van der Meer Kok Jacobs de Haan Vermeulen Peeters Maes Claes Wouters Goossens',
    clubs: ['FC {c}', 'SC {c}', 'VV {c}', '{c} Boys', 'Go Ahead {c}', 'SV {c}', 'KV {c}', 'Sporting {c}', 'RSC {c}', 'Royal {c}'],
    stadium: ['Stadion {c}', 'De Grote Polder', 'Het Molenveld', 'De Kuip Noord', 'Sportpark De Wieken', 'Jan Louwers Arena'],
  },
  turkish: {
    first: 'Emre Mehmet Burak Arda Kerem Cengiz Hakan Ozan Yusuf Serdar Caner Okay Mert Barış Kaan Efe Semih Taylan Salih Oğuz',
    last: 'Yılmaz Kaya Demir Şahin Çelik Yıldız Yıldırım Öztürk Aydın Özdemir Arslan Doğan Kılıç Aslan Çetin Kara Koç Kurt Özkan Şimşek Polat Ünal Erdem Tosun',
    clubs: ['{c}spor', '{c} Belediyespor', '{c} FK', '{c} Gençlerbirliği', '{c} İdman Yurdu', '{c} Kulübü'],
    stadium: ['{c} Stadyumu', 'Yeni {c} Arena', 'Atatürk Stadyumu', 'Şehir Stadyumu'],
  },
  nordic: {
    first:
      'Oskar William Lucas Elias Emil Noah Isak Viktor Mathias Magnus Kasper Andreas Rasmus Mikkel Jonas Sander Kristoffer Erik Alexander Martin Joakim Fredrik Simon Gustav Anton',
    last: 'Hansen Johansen Olsen Larsen Andersen Pedersen Nilsen Kristiansen Jensen Karlsen Johansson Andersson Karlsson Nilsson Eriksson Larsson Olsson Persson Svensson Gustafsson Lindberg Berg Dahl Lund Holm Strand Haugen Sørensen Christensen Madsen',
    clubs: ['{c} IF', '{c} BK', '{c} FF', 'IK {c}', '{c} IL', 'FC {c}', '{c} FK', 'IFK {c}', '{c} SK'],
    stadium: ['{c} Stadion', 'Fjordparken', 'Nordvallen', 'Idrettsparken', 'Søndre Arena'],
  },
  slavic_south: {
    first: 'Luka Ivan Marko Nikola Filip Josip Mateo Ante Stefan Dušan Aleksandar Lazar Nemanja Mihailo Dejan Bruno Dario Petar Vuk Milan Toni Andrej',
    last: 'Horvat Kovačević Babić Marić Jurić Novak Knežević Vuković Petrović Jovanović Nikolić Marković Đorđević Stojanović Ilić Pavlović Milošević Popović Radović',
    clubs: ['NK {c}', 'FK {c}', 'HNK {c}', 'Radnik {c}', 'Mladost {c}', 'Sloga {c}', 'Jedinstvo {c}', 'Proleter {c}'],
    stadium: ['Gradski stadion {c}', 'Stadion Pod Brdom', 'Stadion Kantrida Novi', 'Stadion Mladosti'],
  },
  slavic_west: {
    first:
      'Jakub Kacper Szymon Filip Mateusz Bartosz Michał Piotr Kamil Łukasz Tomáš Jan Ondřej Adam Lukáš Vojtěch David Martin Patrik Krzysztof Dominik Sebastian',
    last: 'Nowak Kowalski Wiśniewski Wójcik Kowalczyk Kamiński Lewandowski Zieliński Szymański Woźniak Dąbrowski Kozłowski Novák Svoboda Novotný Dvořák Černý Procházka Kučera Veselý Horák Němec Pokorný Marek',
    clubs: ['{c} KS', 'Górnik {c}', 'Polonia {c}', 'FK {c}', 'SK {c}', 'Slavoj {c}', 'Stal {c}', 'Baník {c}', 'Viktoria {c}', 'Zagłębie {c}'],
    stadium: ['Stadion Miejski {c}', 'Městský stadion {c}', 'Stadion Ludowy', 'Arena {c}'],
  },
  greek: {
    first:
      'Giorgos Dimitris Nikos Kostas Giannis Christos Vasilis Panagiotis Thanasis Petros Stelios Michalis Lefteris Sotiris Apostolos Fotis Anastasios Manolis',
    last: 'Papadopoulos Pappas Oikonomou Georgiou Nikolaidis Karagiannis Vlachos Konstantinou Dimitriou Makris Ioannou Christodoulou Antoniou Alexiou',
    clubs: ['{c} FC', 'AE {c}', 'PAS {c}', 'Aris {c}', 'Atromitos {c}', 'Iraklis {c}', 'Ethnikos {c}', 'Apollon {c}'],
    stadium: ['Dimotiko Stadio {c}', 'Gipedo {c}', 'Stadio Kleanthis', 'Panthessaliko Neo'],
  },
  arabic: {
    first:
      'Mohammed Ahmed Omar Youssef Hamza Khalid Abdullah Ali Hassan Salem Fahad Saud Tarek Karim Mahmoud Mostafa Achraf Hakim Sofiane Ayoub Nayef Rayan Ziad Bilal Amine',
    last: 'Al-Harbi Al-Qahtani Al-Shehri Al-Dawsari Al-Ghamdi Al-Otaibi Al-Malki Hassan Mansour Abdelaziz El-Sayed Fathy',
    clubs: ['Al {c}', '{c} SC', 'Ittihad {c}', 'Nahda {c}', '{c} Club', 'Raja {c}', 'Wydad {c}', 'Tala’ea {c}'],
    stadium: ['{c} Sports City', 'Prince Faisal Stadium', 'Stade Municipal de {c}', '{c} Stadium', 'Al-Salam Stadium'],
  },
  japanese: {
    first: 'Haruto Sota Yuto Ren Kaito Takumi Riku Daichi Kenta Shota Yuki Hiroki Ryota Wataru Junya Ao Koki',
    last: 'Sato Suzuki Takahashi Tanaka Watanabe Ito Yamamoto Nakamura Kobayashi Kato Yoshida Yamada Sasaki Yamaguchi Matsumoto Inoue Kimura Hayashi Shimizu Mori Ikeda Hashimoto',
    clubs: ['{c} FC', '{c} SC', '{c} United', '{c} Phoenix', '{c} Sakura', '{c} Blitz', 'FC {c}', '{c} Trinity'],
    stadium: ['{c} Stadium', '{c} Athletic Park', 'Ecopa Field', '{c} Football Stadium'],
  },
  korean: {
    first: 'Min-jun Seo-jun Ji-ho Ha-jun Do-yun Jun-woo Hyun-woo Ji-hoon Dong-hyun Sung-min Jae-sung Jun-ho',
    last: 'Kim Lee Park Choi Jung Kang Cho Yoon Jang Lim Han Oh Seo Shin Kwon Hwang Ahn Song Jeon Hong',
    clubs: ['{c} FC', '{c} Citizen', '{c} United', '{c} Dragons', '{c} Hyundai Steelers', '{c} Bluewings'],
    stadium: ['{c} World Cup Stadium', '{c} Sports Complex', '{c} Football Park'],
  },
  chinese: {
    first: 'Wei Lei Jun Hao Yang Peng Tao Bin Jie Chao Long Yu Xin Ming Kai Zhen Bo Feng Rui Yi',
    last: 'Wang Li Zhang Liu Chen Yang Zhao Huang Zhou Wu Xu Sun Hu Zhu Gao Lin He Guo Ma Luo Zheng Liang Song Tang',
    clubs: ['{c} FC', '{c} Dragons', '{c} City', '{c} Lions', '{c} Rising Star', '{c} Tigers'],
    stadium: ['{c} Olympic Sports Centre', '{c} Stadium', '{c} Workers’ Stadium'],
  },
  african_en: {
    first:
      'Victor Samuel Emmanuel Kelechi Ademola Chidera Tunde Kwame Kofi Yaw Kwabena Thabo Sipho Themba Bongani Mohammed Abdul Daniel Joseph Ola Femi Musa Ibrahim Moses Godfrey Wilfred',
    last: 'Okafor Adeyemi Nwankwo Okonkwo Balogun Bassey Mensah Boateng Asamoah Owusu Ayew Sarpong Mokoena Dlamini Nkosi Zungu Tau Mabaso Ndlovu Khumalo Mthembu',
    clubs: ['{c} United', '{c} Stars', '{c} Rangers', '{c} City', '{c} FC', '{c} Warriors', '{c} Heartland', '{c} Pillars', '{c} Chiefs'],
    stadium: ['{c} Township Stadium', '{c} Sports Stadium', 'Liberation Stadium', 'Unity Park', 'Independence Stadium'],
  },
  african_fr: {
    first:
      'Moussa Ibrahima Cheikh Idrissa Mamadou Ismaïla Lamine Serge Wilfried Franck Sébastien Yves Christian André Didier Nicolas Simon Pape Abdou Karim Youssouf Ousmane Habib',
    last: 'Diop Ndiaye Fall Sarr Gueye Cissé Mendy Sow Kouassi Koné Bamba Fofana Traoré Touré Diallo Ba Seck',
    clubs: ['AS {c}', '{c} FC', 'Union {c}', 'Racing {c}', 'Étoile de {c}', 'Jeunesse {c}', 'Stade {c}', 'Africa Sports {c}', 'Canon {c}'],
    stadium: ['Stade Municipal de {c}', 'Stade de l’Amitié', 'Stade de la Réunification', 'Stade Léopold'],
  },
};

const split = (s: string) => s.split(' ').filter(Boolean);
const cache = new Map<string, { first: string[]; last: string[]; clubs: string[]; stadium: string[] }>();

export function culture(name: string) {
  let c = cache.get(name);
  if (!c) {
    const raw = C[name] ?? C.english!;
    // "de Jong", "van Dijk": rejoin Dutch particles that the space-split separated
    const last = name === 'dutch' ? rejoinParticles(split(raw.last)) : split(raw.last);
    c = { first: split(raw.first), last, clubs: raw.clubs, stadium: raw.stadium };
    cache.set(name, c);
  }
  return c;
}

function rejoinParticles(words: string[]): string[] {
  const out: string[] = [];
  let pending = '';
  for (const w of words) {
    if (w === 'de' || w === 'van' || w === 'den' || w === 'der') {
      pending = pending ? `${pending} ${w}` : w;
    } else {
      out.push(pending ? `${pending} ${w}` : w);
      pending = '';
    }
  }
  return out;
}

/** Real club names we must never generate. */
export const BLOCKED_CLUB_NAMES = new Set([
  'Real Madrid',
  'Real Sociedad',
  'Real Betis',
  'Atlético Madrid',
  'Deportivo Alavés',
  'Real Valladolid',
  'Real Oviedo',
  'Real Zaragoza',
  'Racing Santander',
  'Sporting Gijón',
  'Leeds United',
  'Sheffield United',
  'Hull City',
  'Bradford City',
  'Coventry City',
  'Derby County',
  'Stoke City',
  'Leicester City',
  'Bristol City',
  'Bristol Rovers',
  'Plymouth Argyle',
  'Norwich City',
  'Ipswich Town',
  'Luton Town',
  'Swindon Town',
  'Oxford United',
  'Cambridge United',
  'Peterborough United',
  'Preston North End',
  'Blackburn Rovers',
  'Bolton Wanderers',
  'Wigan Athletic',
  'Stockport County',
  'Carlisle United',
  'Doncaster Rovers',
  'Reading FC',
  'Watford FC',
  'Exeter City',
  'Southend United',
  'Brighton & Hove Albion',
  'Northampton Town',
  'Walsall FC',
  'Sunderland AFC',
  'Portsmouth FC',
  'Middlesbrough FC',
  'VfB Stuttgart',
  'SC Freiburg',
  '1. FC Nürnberg',
  'FC Augsburg',
  'VfL Bochum',
  'SV Werder Bremen',
  'Eintracht Braunschweig',
  '1. FC Kaiserslautern',
  'FC Ingolstadt',
  'AC Milan',
  'SS Lazio',
  'US Lecce',
  'US Cremonese',
  'US Salernitana',
  'AC Monza',
  'Atalanta',
  'Venezia FC',
  'Como Calcio',
  'Parma Calcio',
  'Empoli FC',
  'Genoa',
  'Olympique Lyon',
  'Olympique Marseille',
  'Stade Rennais',
  'Stade Brestois',
  'FC Nantes',
  'RC Lens',
  'RC Strasbourg',
  'AS Saint-Étienne',
  'FC Metz',
  'AJ Auxerre',
  'Toulouse FC',
  'SC Braga',
  'FC Porto',
  'Sporting Braga',
  'FC Utrecht',
  'FC Groningen',
  'FC Twente',
  'SC Heerenveen',
  'Go Ahead Deventer',
  'NAC Breda',
  'FC Emmen',
  'Al Ittihad',
  'Al Ahli',
  'Al Hilal',
  'Al Nassr',
  'Raja Casablanca',
  'Wydad Casablanca',
  'Ulsan Hyundai Steelers',
  'Suwon Bluewings',
]);

/** Full names of famous real players that common-name pools could recreate; these get re-rolled. */
export const BLOCKED_PLAYER_NAMES = new Set([
  'Kyle Walker',
  'Luke Shaw',
  'Callum Wilson',
  'Danny Ward',
  'Jordan Henderson',
  'Ben Davies',
  'James Ward',
  'Jack Robinson',
  'Harry Wilson',
  'Tom Taylor',
  'Raúl García',
  'Diego Costa',
  'Iker Muniain',
  'Pablo Fornals',
  'Sergio Gómez',
  'Álvaro Rodríguez',
  'Carlos Soler',
  'Daniel Carvajal',
  'Bruno Fernandes',
  'Thiago Silva',
  'Danilo Pereira',
  'André Silva',
  'Fábio Silva',
  'Bruno Alves',
  'Rafael Leão',
  'João Félix',
  'Diogo Costa',
  'Gonçalo Ramos',
  'Timo Werner',
  'Leon Bailey',
  'Kevin Schade',
  'Marco Richter',
  'Jonas Hofmann',
  'Florian Neuhaus',
  'Niklas Süle',
  'David Raum',
  'Robin Koch',
  'Lukas Klostermann',
  'Lorenzo Pellegrini',
  'Federico Chiesa',
  'Andrea Belotti',
  'Davide Frattesi',
  'Nicolò Barella',
  'Matteo Darmian',
  'Gianluca Mancini',
  'Lucas Hernández',
  'Benjamin Pavard',
  'Thomas Lemar',
  'Antoine Griezmann',
  'Clément Lenglet',
  'Jules Koundé',
  'Maxime Lopez',
  'Luuk de Jong',
  'Daan Visser',
  'Jesse Bakker',
  'Stijn Smit',
  'Ruben Vargas',
  'Bram Dekker',
  'Luka Modrić',
  'Ivan Perišić',
  'Marko Petrović',
  'Nikola Milenković',
  'Dušan Vlahović',
  'Filip Kostić',
  'Mohammed Kudus',
  'Emmanuel Dennis',
  'Victor Moses',
  'Samuel Chukwueze',
  'Joseph Paintsil',
]);
