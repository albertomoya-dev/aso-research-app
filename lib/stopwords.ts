import { fold } from "./text";

/*
 * Words that never make a keyword on their own, per store language. Written without accents:
 * every lookup is folded first (see lib/text.ts).
 *
 * STOPWORDS are function words: articles, pronouns, prepositions, connectors, adverbs and the
 * auxiliary and modal verbs with their common forms, plus web leftovers (com, www, etc). A phrase
 * never starts or ends with one ("de entrenamiento" is not a keyword, "plan de entrenamiento" is).
 *
 * GENERIC words are the vocabulary of any app description ("datos", "configurar", "experiencia"):
 * useless as a one-word keyword, but fine inside a longer phrase ("copia de seguridad de datos").
 */

const WEB = "com www http https etc org net html app apps";

const STOPWORDS: Record<string, string> = {
  es: `a al algo algun alguna algunas alguno algunos ante antes asi aun aunque aqui alli ahi bajo bien cada como con contra cual cuales
    cualquier cualquiera cuando cuanto cuanta cuantos cuantas de del desde donde dos durante e el ella ellas ellos en entre era eran eres es esa esas ese eso esos
    esta estas este esto estos estan estar estoy estamos estais estaba estaban estara estaran fue fueron fui gran grandes ha he has hemos han
    habia habian haber hace hacer hacen haces hacemos hago hizo hasta hay la las le les lo los mas me mi mis mio mia mucho mucha muchos muchas muy nada
    ni no nos nosotros nuestra nuestro nuestros nuestras o os otra otro otros otras para pero poco poca pocos pocas por porque pues puede pueden
    puedes podemos podeis puedo podra podran podras podras podria podrian podrias poder que quien quienes se sea sean segun ser si sin sobre solo
    sola solos solas son soy somos su sus tambien tampoco tan tanto tanta tantos tantas te ti tiene tienen tienes tenemos tengo tener tenga tendra tendras
    todo todos todas toda tu tus tuya tuyo tuyas tuyos u un una unas uno unos usted ustedes vez veces y ya yo
    ademas ahora antes despues luego entonces siempre nunca jamas tambien todavia aun casi incluso mientras apenas pronto hoy ayer
    aqui alli asi bastante demasiado solamente simplemente realmente facilmente rapidamente totalmente completamente directamente
    automaticamente especialmente exactamente solo mismo misma mismos mismas tal tales mejor peor menos mas mucho
    debe deben debes debemos debo deber deberia deberian deberias necesita necesitan necesitas necesito quiere quieren quieres quiero queremos
    permite permiten permitir sirve sirven va van vas vamos voy ir sera seran seras sido siendo esten este estes hay haya hayan
    hacia mediante tras via sino ninguno ninguna ningun nadie alguien demas varios varias otros ambos ambas cuyo cuya
    dentro fuera encima debajo delante detras alrededor
    ejemplo ej etc si no ok gracias hola`,
  en: `a about above after again against all also am an and any are aren't as at be because been before being below between both but by can can't cannot could
    couldn't did didn't do does doesn't doing don't down during each else even ever every few for from further get gets getting got had has hasn't have haven't having he her
    here hers herself him himself his how however i if in into is isn't it it's its itself just let lets like many may me might more most much must my myself
    need needs never new no nor not now of off often on once one only or other others our ours ourselves out over own per quite rather really same shall she should
    shouldn't since so some such than that the their theirs them themselves then there these they this those though through thus to too under until up upon
    us use used uses using very via was wasn't we well were weren't what whatever when whenever where whether which while who whom whose why will with within
    without won't would wouldn't yet you you're your yours yourself yourselves also already always anyway etc eg ie e.g i.e easily simply quickly
    lot lots thing things way ways example able enable enables allow allows`,
  pt: `a ao aos as ate com como contra da das de do dos desde e ela elas ele eles em entre era eram essa essas esse esses esta estas este estes estar estao
    esta estamos estava eu foi foram ha isso isto la mais mas me meu meus minha minhas muito muita muitos muitas na nas nem no nos nossa nosso nao o os ou
    para pela pelas pelo pelos por porque pode podem podes pode poder podera qual quais quando que quem se sem ser seu seus sua suas sao so tambem te tem
    tens temos ter todo todos toda todas tu um uma umas uns voce voces vai vao agora ainda alem depois antes sempre nunca ja aqui ali assim apenas somente
    bem muito pouco qualquer quaisquer cada outro outra outros outras mesmo mesma deve devem precisa precisam permite exemplo coisa coisas forma maneira vez`,
  fr: `a au aux avec ce ces cet cette dans de des du elle elles en est et etre il ils je la le les leur leurs lui mais me mes moi mon ne nous on ou par pas
    plus pour qu que qui sa se ses son sur ta te tes toi ton tous tout toute toutes tu un une vos votre vous y ont sont suis es etes etait sera seront
    avoir ai as avons avez peut peuvent pouvez pouvons peux doit doivent devez faut fait faire aussi alors apres avant deja encore ici jamais maintenant
    toujours tres bien comme donc car ainsi chaque quelque quelques autre autres meme sans sous entre vers chez depuis pendant exemple chose choses
    facon maniere fois`,
  de: `als am an auch auf aus bei bin bis bist das dass dein deine dem den der des die dich dir du ein eine einem einen einer eines er es fur hat haben
    habe hast ich ihr ihre im in ist ja kann kannst konnen konnt mit nach nicht noch nur oder sein seine sich sie sind so uber um und uns unser unsere
    von vor wie wir wird werden wirst zu zum zur aber alle allen alles also auch bereits dann da dazu dein deshalb doch durch einfach etwa ganz gibt hier
    immer jetzt jeder jede jedes man mehr muss mussen nun oft schon sehr soll sollen sowie viel viele war waren weil wenn wieder ohne zwischen beispiel`,
  it: `a ad al alla alle allo ai agli anche che chi con da dal dalla dai del della delle dello dei degli di e gli ha hai hanno ho i il in io la le lo ma mi
    nel nella nei non per piu se si sono sei siamo su sua suo sue suoi ti tra fra tu tua tuo un una uno essere avere puo possono puoi devi deve devono
    anche ancora adesso ora poi dopo prima sempre mai gia qui li cosi molto poco ogni qualsiasi altro altra altri altre stesso stessa senza come quando
    dove perche esempio cosa cose modo volta`,
};

const GENERIC: Record<string, string> = {
  es: `acceso accesos datos configurar configuracion ajustes experiencia botones boton disponible disponibles necesario necesaria necesarios
    lugar lugares diferentes diferente distintos distintas varios nuevo nueva nuevos nuevas mejor mejores facil faciles sencillo sencilla rapido rapida
    gratis gratuita gratuito gratuitas opcion opciones funcion funciones caracteristicas aplicacion aplicaciones usuario usuarios uso usar utilizar
    informacion contenido pantalla pantallas tiempo dia dias semana mes ano anos persona personas gente mundo todo vida version actualizacion
    cuenta registro privacidad politica terminos condiciones soporte ayuda contacto correo email permiso permisos dispositivo dispositivos
    cosa cosas forma manera modo momento caso parte tipo tipos
    telefono menu lista seccion nivel total importante posible general principal personal propio propia sistema servicio servicios`,
  en: `access data settings setting configure experience button buttons available necessary place different various feature features option options
    application user users information content screen time day days week month year people world life version update account support help contact
    email permission permissions device devices phone menu list section level total important possible general main personal system service services
    free best easy simple fast great good android ios iphone ipad`,
  pt: `acesso dados configurar configuracoes experiencia botoes botao disponivel necessario lugar diferentes opcao opcoes funcao funcoes aplicativo
    usuario usuarios informacao conteudo tela tempo dia dias pessoa pessoas versao conta suporte ajuda dispositivo gratis gratuito facil melhor`,
  fr: `acces donnees configurer parametres experience bouton boutons disponible necessaire lieu differents option options fonction fonctions application
    utilisateur utilisateurs information contenu ecran temps jour jours personne personnes version compte aide appareil gratuit facile meilleur`,
  de: `zugang daten einstellungen konfigurieren erfahrung taste tasten verfugbar notwendig ort verschiedene option optionen funktion funktionen
    anwendung nutzer benutzer information inhalt bildschirm zeit tag tage person personen version konto hilfe gerat kostenlos einfach beste`,
  it: `accesso dati impostazioni configurare esperienza pulsante pulsanti disponibile necessario luogo diversi opzione opzioni funzione funzioni
    applicazione utente utenti informazioni contenuto schermo tempo giorno giorni persona persone versione account aiuto dispositivo gratis facile migliore`,
};

const split = (words: string) => words.split(/\s+/).filter(Boolean).map(fold);

const cache = new Map<string, Set<string>>();
function cached(key: string, build: () => string[]): Set<string> {
  let set = cache.get(key);
  if (!set) cache.set(key, (set = new Set(build())));
  return set;
}

/** Function words of the language, plus English and web leftovers: English shows up in listings of every country. */
export function stopwordsFor(lang: string): Set<string> {
  return cached(`stop:${lang}`, () => [...split(STOPWORDS[lang] ?? ""), ...split(STOPWORDS.en), ...split(WEB)]);
}

/** Generic description words of the language (and English): never a one-word keyword. */
export function genericWordsFor(lang: string): Set<string> {
  return cached(`generic:${lang}`, () => [...split(GENERIC[lang] ?? ""), ...split(GENERIC.en)]);
}

export function isStopword(word: string, lang: string): boolean {
  return stopwordsFor(lang).has(fold(word.trim()));
}

export type NoiseKind = "stopword" | "generic";

/**
 * Why the keyword is filler, or null when it is not: "stopword" for a number or a phrase made only of
 * function words ("puedes", "etc", "com", "ahora mismo"); "generic" for a single generic word ("datos").
 * Generic words only count alone: "el tiempo" or "tiempo hoy" keep a real search behind them.
 */
export function noiseKind(term: string, lang: string): NoiseKind | null {
  const words = fold(term).split(/[^\p{L}\p{N}'’]+/u).filter(Boolean);
  if (words.length === 0) return "stopword";
  const stop = stopwordsFor(lang);
  if (words.every((w) => stop.has(w) || /^\d+$/.test(w) || [...w].length < 2)) return "stopword";
  if (words.length === 1 && genericWordsFor(lang).has(words[0])) return "generic";
  return null;
}

/** True when the keyword is only filler (see `noiseKind`). Phrases with one real word pass. */
export function isNoiseTerm(term: string, lang: string): boolean {
  return noiseKind(term, lang) !== null;
}
