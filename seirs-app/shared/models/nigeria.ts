/**
 * Nigeria's administrative geography, as data rather than guesswork.
 *
 * WHY THIS FILE EXISTS. Trip discovery matched a passenger's typed city
 * against a city name derived from Google's address components, and in
 * Nigeria that derivation is unreliable in a way that hides real trips:
 *
 *   Obafemi Awolowo University  ->  filed as "Kajola"  (an LGA)
 *   Olorunda Aba Market, Ibadan ->  filed as "Aba"     (a city 400km away)
 *
 * Both were found on the device on 2026-09-04, and in both cases the
 * correct name was sitting in the formatted address the whole time. A
 * wrong address is the fastest way to kill a logistics company, in the
 * founder's words, so the naming has to come from a list we control.
 *
 * WHAT IS AND IS NOT CLOSED. States and local governments are fixed:
 * 36 states plus the FCT, and 774 local governments (768 LGAs plus the 6
 * FCT area councils), a number set in the constitution. Towns are NOT a
 * closed set: there is no official register, and any list of Nigerian
 * settlements is missing somebody's town the week it ships. So this file
 * is authoritative about states and LGAs, and deliberately partial about
 * settlements, and nothing downstream may treat an absent name as an
 * invalid one.
 *
 * The counts below are a checksum, not decoration: they sum to 774, and
 * a state whose array length stops matching its `lgaCount` is a typo
 * somebody introduced. `verifyGeography()` at the bottom checks it.
 */

export interface NgState {
  /** Canonical name, without the word "State". */
  name:     string;
  /** Seat of government. Often, but not always, the largest town. */
  capital:  string;
  /** Geopolitical zone, which is how Nigerians actually group states. */
  zone:     'North Central' | 'North East' | 'North West'
          | 'South East'    | 'South South' | 'South West';
  /** Constitutional count, used to verify the list below it. */
  lgaCount: number;
  /** Every local government in the state, alphabetical. */
  lgas:     string[];
}

export const NG_STATES: NgState[] = [
  {
    name: 'Abia', capital: 'Umuahia', zone: 'South East', lgaCount: 17,
    lgas: [
      'Aba North', 'Aba South', 'Arochukwu', 'Bende', 'Ikwuano', 'Isiala Ngwa North',
      'Isiala Ngwa South', 'Isuikwuato', 'Obi Ngwa', 'Ohafia', 'Osisioma',
      'Ugwunagbo', 'Ukwa East', 'Ukwa West', 'Umuahia North', 'Umuahia South',
      'Umu Nneochi',
    ],
  },
  {
    name: 'Adamawa', capital: 'Yola', zone: 'North East', lgaCount: 21,
    lgas: [
      'Demsa', 'Fufore', 'Ganye', 'Girei', 'Gombi', 'Guyuk', 'Hong', 'Jada',
      'Lamurde', 'Madagali', 'Maiha', 'Mayo Belwa', 'Michika', 'Mubi North',
      'Mubi South', 'Numan', 'Shelleng', 'Song', 'Toungo', 'Yola North',
      'Yola South',
    ],
  },
  {
    name: 'Akwa Ibom', capital: 'Uyo', zone: 'South South', lgaCount: 31,
    lgas: [
      'Abak', 'Eastern Obolo', 'Eket', 'Esit Eket', 'Essien Udim', 'Etim Ekpo',
      'Etinan', 'Ibeno', 'Ibesikpo Asutan', 'Ibiono Ibom', 'Ika', 'Ikono',
      'Ikot Abasi', 'Ikot Ekpene', 'Ini', 'Itu', 'Mbo', 'Mkpat Enin',
      'Nsit Atai', 'Nsit Ibom', 'Nsit Ubium', 'Obot Akara', 'Okobo', 'Onna',
      'Oron', 'Oruk Anam', 'Udung Uko', 'Ukanafun', 'Uruan', 'Urue Offong/Oruko',
      'Uyo',
    ],
  },
  {
    name: 'Anambra', capital: 'Awka', zone: 'South East', lgaCount: 21,
    lgas: [
      'Aguata', 'Anambra East', 'Anambra West', 'Anaocha', 'Awka North',
      'Awka South', 'Ayamelum', 'Dunukofia', 'Ekwusigo', 'Idemili North',
      'Idemili South', 'Ihiala', 'Njikoka', 'Nnewi North', 'Nnewi South',
      'Ogbaru', 'Onitsha North', 'Onitsha South', 'Orumba North', 'Orumba South',
      'Oyi',
    ],
  },
  {
    name: 'Bauchi', capital: 'Bauchi', zone: 'North East', lgaCount: 20,
    lgas: [
      'Alkaleri', 'Bauchi', 'Bogoro', 'Damban', 'Darazo', 'Dass', 'Gamawa',
      'Ganjuwa', 'Giade', 'Itas/Gadau', 'Jamaare', 'Katagum', 'Kirfi', 'Misau',
      'Ningi', 'Shira', 'Tafawa Balewa', 'Toro', 'Warji', 'Zaki',
    ],
  },
  {
    name: 'Bayelsa', capital: 'Yenagoa', zone: 'South South', lgaCount: 8,
    lgas: [
      'Brass', 'Ekeremor', 'Kolokuma/Opokuma', 'Nembe', 'Ogbia', 'Sagbama',
      'Southern Ijaw', 'Yenagoa',
    ],
  },
  {
    name: 'Benue', capital: 'Makurdi', zone: 'North Central', lgaCount: 23,
    lgas: [
      'Ado', 'Agatu', 'Apa', 'Buruku', 'Gboko', 'Guma', 'Gwer East', 'Gwer West',
      'Katsina-Ala', 'Konshisha', 'Kwande', 'Logo', 'Makurdi', 'Obi', 'Ogbadibo',
      'Ohimini', 'Oju', 'Okpokwu', 'Otukpo', 'Tarka', 'Ukum', 'Ushongo', 'Vandeikya',
    ],
  },
  {
    name: 'Borno', capital: 'Maiduguri', zone: 'North East', lgaCount: 27,
    lgas: [
      'Abadam', 'Askira/Uba', 'Bama', 'Bayo', 'Biu', 'Chibok', 'Damboa', 'Dikwa',
      'Gubio', 'Guzamala', 'Gwoza', 'Hawul', 'Jere', 'Kaga', 'Kala/Balge',
      'Konduga', 'Kukawa', 'Kwaya Kusar', 'Mafa', 'Magumeri', 'Maiduguri',
      'Marte', 'Mobbar', 'Monguno', 'Ngala', 'Nganzai', 'Shani',
    ],
  },
  {
    name: 'Cross River', capital: 'Calabar', zone: 'South South', lgaCount: 18,
    lgas: [
      'Abi', 'Akamkpa', 'Akpabuyo', 'Bakassi', 'Bekwarra', 'Biase', 'Boki',
      'Calabar Municipal', 'Calabar South', 'Etung', 'Ikom', 'Obanliku', 'Obubra',
      'Obudu', 'Odukpani', 'Ogoja', 'Yakuur', 'Yala',
    ],
  },
  {
    name: 'Delta', capital: 'Asaba', zone: 'South South', lgaCount: 25,
    lgas: [
      'Aniocha North', 'Aniocha South', 'Bomadi', 'Burutu', 'Ethiope East',
      'Ethiope West', 'Ika North East', 'Ika South', 'Isoko North', 'Isoko South',
      'Ndokwa East', 'Ndokwa West', 'Okpe', 'Oshimili North', 'Oshimili South',
      'Patani', 'Sapele', 'Udu', 'Ughelli North', 'Ughelli South', 'Ukwuani',
      'Uvwie', 'Warri North', 'Warri South', 'Warri South West',
    ],
  },
  {
    name: 'Ebonyi', capital: 'Abakaliki', zone: 'South East', lgaCount: 13,
    lgas: [
      'Abakaliki', 'Afikpo North', 'Afikpo South', 'Ebonyi', 'Ezza North',
      'Ezza South', 'Ikwo', 'Ishielu', 'Ivo', 'Izzi', 'Ohaozara', 'Ohaukwu',
      'Onicha',
    ],
  },
  {
    name: 'Edo', capital: 'Benin City', zone: 'South South', lgaCount: 18,
    lgas: [
      'Akoko-Edo', 'Egor', 'Esan Central', 'Esan North-East', 'Esan South-East',
      'Esan West', 'Etsako Central', 'Etsako East', 'Etsako West', 'Igueben',
      'Ikpoba-Okha', 'Oredo', 'Orhionmwon', 'Ovia North-East', 'Ovia South-West',
      'Owan East', 'Owan West', 'Uhunmwonde',
    ],
  },
  {
    name: 'Ekiti', capital: 'Ado-Ekiti', zone: 'South West', lgaCount: 16,
    lgas: [
      'Ado-Ekiti', 'Efon', 'Ekiti East', 'Ekiti South-West', 'Ekiti West',
      'Emure', 'Gbonyin', 'Ido-Osi', 'Ijero', 'Ikere', 'Ikole', 'Ilejemeje',
      'Irepodun/Ifelodun', 'Ise/Orun', 'Moba', 'Oye',
    ],
  },
  {
    name: 'Enugu', capital: 'Enugu', zone: 'South East', lgaCount: 17,
    lgas: [
      'Aninri', 'Awgu', 'Enugu East', 'Enugu North', 'Enugu South', 'Ezeagu',
      'Igbo Etiti', 'Igbo Eze North', 'Igbo Eze South', 'Isi Uzo', 'Nkanu East',
      'Nkanu West', 'Nsukka', 'Oji River', 'Udenu', 'Udi', 'Uzo Uwani',
    ],
  },
  {
    name: 'FCT', capital: 'Abuja', zone: 'North Central', lgaCount: 6,
    lgas: [
      'Abaji', 'Abuja Municipal', 'Bwari', 'Gwagwalada', 'Kuje', 'Kwali',
    ],
  },
  {
    name: 'Gombe', capital: 'Gombe', zone: 'North East', lgaCount: 11,
    lgas: [
      'Akko', 'Balanga', 'Billiri', 'Dukku', 'Funakaye', 'Gombe', 'Kaltungo',
      'Kwami', 'Nafada', 'Shongom', 'Yamaltu/Deba',
    ],
  },
  {
    name: 'Imo', capital: 'Owerri', zone: 'South East', lgaCount: 27,
    lgas: [
      'Aboh Mbaise', 'Ahiazu Mbaise', 'Ehime Mbano', 'Ezinihitte', 'Ideato North',
      'Ideato South', 'Ihitte/Uboma', 'Ikeduru', 'Isiala Mbano', 'Isu', 'Mbaitoli',
      'Ngor Okpala', 'Njaba', 'Nkwerre', 'Nwangele', 'Obowo', 'Oguta',
      'Ohaji/Egbema', 'Okigwe', 'Onuimo', 'Orlu', 'Orsu', 'Oru East', 'Oru West',
      'Owerri Municipal', 'Owerri North', 'Owerri West',
    ],
  },
  {
    name: 'Jigawa', capital: 'Dutse', zone: 'North West', lgaCount: 27,
    lgas: [
      'Auyo', 'Babura', 'Biriniwa', 'Birnin Kudu', 'Buji', 'Dutse', 'Gagarawa',
      'Garki', 'Gumel', 'Guri', 'Gwaram', 'Gwiwa', 'Hadejia', 'Jahun', 'Kafin Hausa',
      'Kaugama', 'Kazaure', 'Kiri Kasama', 'Kiyawa', 'Maigatari', 'Malam Madori',
      'Miga', 'Ringim', 'Roni', 'Sule Tankarkar', 'Taura', 'Yankwashi',
    ],
  },
  {
    name: 'Kaduna', capital: 'Kaduna', zone: 'North West', lgaCount: 23,
    lgas: [
      'Birnin Gwari', 'Chikun', 'Giwa', 'Igabi', 'Ikara', 'Jaba', "Jema'a",
      'Kachia', 'Kaduna North', 'Kaduna South', 'Kagarko', 'Kajuru', 'Kaura',
      'Kauru', 'Kubau', 'Kudan', 'Lere', 'Makarfi', 'Sabon Gari', 'Sanga',
      'Soba', 'Zangon Kataf', 'Zaria',
    ],
  },
  {
    name: 'Kano', capital: 'Kano', zone: 'North West', lgaCount: 44,
    lgas: [
      'Ajingi', 'Albasu', 'Bagwai', 'Bebeji', 'Bichi', 'Bunkure', 'Dala',
      'Dambatta', 'Dawakin Kudu', 'Dawakin Tofa', 'Doguwa', 'Fagge', 'Gabasawa',
      'Garko', 'Garun Mallam', 'Gaya', 'Gezawa', 'Gwale', 'Gwarzo', 'Kabo',
      'Kano Municipal', 'Karaye', 'Kibiya', 'Kiru', 'Kumbotso', 'Kunchi', 'Kura',
      'Madobi', 'Makoda', 'Minjibir', 'Nasarawa', 'Rano', 'Rimin Gado', 'Rogo',
      'Shanono', 'Sumaila', 'Takai', 'Tarauni', 'Tofa', 'Tsanyawa', 'Tudun Wada',
      'Ungogo', 'Warawa', 'Wudil',
    ],
  },
  {
    name: 'Katsina', capital: 'Katsina', zone: 'North West', lgaCount: 34,
    lgas: [
      'Bakori', 'Batagarawa', 'Batsari', 'Baure', 'Bindawa', 'Charanchi',
      'Dandume', 'Danja', 'Dan Musa', 'Daura', 'Dutsi', 'Dutsin Ma', 'Faskari',
      'Funtua', 'Ingawa', 'Jibia', 'Kafur', 'Kaita', 'Kankara', 'Kankia',
      'Katsina', 'Kurfi', 'Kusada', "Mai'Adua", 'Malumfashi', 'Mani', 'Mashi',
      'Matazu', 'Musawa', 'Rimi', 'Sabuwa', 'Safana', 'Sandamu', 'Zango',
    ],
  },
  {
    name: 'Kebbi', capital: 'Birnin Kebbi', zone: 'North West', lgaCount: 21,
    lgas: [
      'Aleiro', 'Arewa Dandi', 'Argungu', 'Augie', 'Bagudo', 'Birnin Kebbi',
      'Bunza', 'Dandi', 'Fakai', 'Gwandu', 'Jega', 'Kalgo', 'Koko/Besse',
      'Maiyama', 'Ngaski', 'Sakaba', 'Shanga', 'Suru', 'Wasagu/Danko', 'Yauri',
      'Zuru',
    ],
  },
  {
    name: 'Kogi', capital: 'Lokoja', zone: 'North Central', lgaCount: 21,
    lgas: [
      'Adavi', 'Ajaokuta', 'Ankpa', 'Bassa', 'Dekina', 'Ibaji', 'Idah',
      'Igalamela Odolu', 'Ijumu', 'Kabba/Bunu', 'Kogi', 'Lokoja', 'Mopa Muro',
      'Ofu', 'Ogori/Magongo', 'Okehi', 'Okene', 'Olamaboro', 'Omala', 'Yagba East',
      'Yagba West',
    ],
  },
  {
    name: 'Kwara', capital: 'Ilorin', zone: 'North Central', lgaCount: 16,
    lgas: [
      'Asa', 'Baruten', 'Edu', 'Ekiti', 'Ifelodun', 'Ilorin East', 'Ilorin South',
      'Ilorin West', 'Irepodun', 'Isin', 'Kaiama', 'Moro', 'Offa', 'Oke Ero',
      'Oyun', 'Pategi',
    ],
  },
  {
    name: 'Lagos', capital: 'Ikeja', zone: 'South West', lgaCount: 20,
    lgas: [
      'Agege', 'Ajeromi-Ifelodun', 'Alimosho', 'Amuwo-Odofin', 'Apapa', 'Badagry',
      'Epe', 'Eti-Osa', 'Ibeju-Lekki', 'Ifako-Ijaiye', 'Ikeja', 'Ikorodu',
      'Kosofe', 'Lagos Island', 'Lagos Mainland', 'Mushin', 'Ojo', 'Oshodi-Isolo',
      'Shomolu', 'Surulere',
    ],
  },
  {
    name: 'Nasarawa', capital: 'Lafia', zone: 'North Central', lgaCount: 13,
    lgas: [
      'Akwanga', 'Awe', 'Doma', 'Karu', 'Keana', 'Keffi', 'Kokona', 'Lafia',
      'Nasarawa', 'Nasarawa Egon', 'Obi', 'Toto', 'Wamba',
    ],
  },
  {
    name: 'Niger', capital: 'Minna', zone: 'North Central', lgaCount: 25,
    lgas: [
      'Agaie', 'Agwara', 'Bida', 'Borgu', 'Bosso', 'Chanchaga', 'Edati', 'Gbako',
      'Gurara', 'Katcha', 'Kontagora', 'Lapai', 'Lavun', 'Magama', 'Mariga',
      'Mashegu', 'Mokwa', 'Moya', 'Paikoro', 'Rafi', 'Rijau', 'Shiroro', 'Suleja',
      'Tafa', 'Wushishi',
    ],
  },
  {
    name: 'Ogun', capital: 'Abeokuta', zone: 'South West', lgaCount: 20,
    lgas: [
      'Abeokuta North', 'Abeokuta South', 'Ado-Odo/Ota', 'Ewekoro', 'Ifo',
      'Ijebu East', 'Ijebu North', 'Ijebu North East', 'Ijebu Ode', 'Ikenne',
      'Imeko Afon', 'Ipokia', 'Obafemi Owode', 'Odeda', 'Odogbolu',
      'Ogun Waterside', 'Remo North', 'Sagamu', 'Yewa North', 'Yewa South',
    ],
  },
  {
    name: 'Ondo', capital: 'Akure', zone: 'South West', lgaCount: 18,
    lgas: [
      'Akoko North-East', 'Akoko North-West', 'Akoko South-East',
      'Akoko South-West', 'Akure North', 'Akure South', 'Ese Odo', 'Idanre',
      'Ifedore', 'Ilaje', 'Ile Oluji/Okeigbo', 'Irele', 'Odigbo', 'Okitipupa',
      'Ondo East', 'Ondo West', 'Ose', 'Owo',
    ],
  },
  {
    name: 'Osun', capital: 'Osogbo', zone: 'South West', lgaCount: 30,
    lgas: [
      'Aiyedaade', 'Aiyedire', 'Atakunmosa East', 'Atakunmosa West', 'Boluwaduro',
      'Boripe', 'Ede North', 'Ede South', 'Egbedore', 'Ejigbo', 'Ife Central',
      'Ife East', 'Ife North', 'Ife South', 'Ifedayo', 'Ifelodun', 'Ila',
      'Ilesa East', 'Ilesa West', 'Irepodun', 'Irewole', 'Isokan', 'Iwo',
      'Obokun', 'Odo Otin', 'Ola Oluwa', 'Olorunda', 'Oriade', 'Orolu', 'Osogbo',
    ],
  },
  {
    name: 'Oyo', capital: 'Ibadan', zone: 'South West', lgaCount: 33,
    lgas: [
      'Afijio', 'Akinyele', 'Atiba', 'Atisbo', 'Egbeda', 'Ibadan North',
      'Ibadan North-East', 'Ibadan North-West', 'Ibadan South-East',
      'Ibadan South-West', 'Ibarapa Central', 'Ibarapa East', 'Ibarapa North',
      'Ido', 'Irepo', 'Iseyin', 'Itesiwaju', 'Iwajowa', 'Kajola', 'Lagelu',
      'Ogbomosho North', 'Ogbomosho South', 'Ogo Oluwa', 'Olorunsogo', 'Oluyole',
      'Ona Ara', 'Orelope', 'Ori Ire', 'Oyo East', 'Oyo West', 'Saki East',
      'Saki West', 'Surulere',
    ],
  },
  {
    name: 'Plateau', capital: 'Jos', zone: 'North Central', lgaCount: 17,
    lgas: [
      'Barkin Ladi', 'Bassa', 'Bokkos', 'Jos East', 'Jos North', 'Jos South',
      'Kanam', 'Kanke', 'Langtang North', 'Langtang South', 'Mangu', 'Mikang',
      'Pankshin', 'Quaan Pan', 'Riyom', 'Shendam', 'Wase',
    ],
  },
  {
    name: 'Rivers', capital: 'Port Harcourt', zone: 'South South', lgaCount: 23,
    lgas: [
      'Abua/Odual', 'Ahoada East', 'Ahoada West', 'Akuku-Toru', 'Andoni',
      'Asari-Toru', 'Bonny', 'Degema', 'Eleme', 'Emohua', 'Etche', 'Gokana',
      'Ikwerre', 'Khana', 'Obio/Akpor', 'Ogba/Egbema/Ndoni', 'Ogu/Bolo', 'Okrika',
      'Omuma', 'Opobo/Nkoro', 'Oyigbo', 'Port Harcourt', 'Tai',
    ],
  },
  {
    name: 'Sokoto', capital: 'Sokoto', zone: 'North West', lgaCount: 23,
    lgas: [
      'Binji', 'Bodinga', 'Dange Shuni', 'Gada', 'Goronyo', 'Gudu', 'Gwadabawa',
      'Illela', 'Isa', 'Kebbe', 'Kware', 'Rabah', 'Sabon Birni', 'Shagari',
      'Silame', 'Sokoto North', 'Sokoto South', 'Tambuwal', 'Tangaza', 'Tureta',
      'Wamako', 'Wurno', 'Yabo',
    ],
  },
  {
    name: 'Taraba', capital: 'Jalingo', zone: 'North East', lgaCount: 16,
    lgas: [
      'Ardo Kola', 'Bali', 'Donga', 'Gashaka', 'Gassol', 'Ibi', 'Jalingo',
      'Karim Lamido', 'Kumi', 'Lau', 'Sardauna', 'Takum', 'Ussa', 'Wukari',
      'Yorro', 'Zing',
    ],
  },
  {
    name: 'Yobe', capital: 'Damaturu', zone: 'North East', lgaCount: 17,
    lgas: [
      'Bade', 'Bursari', 'Damaturu', 'Fika', 'Fune', 'Geidam', 'Gujba', 'Gulani',
      'Jakusko', 'Karasuwa', 'Machina', 'Nangere', 'Nguru', 'Potiskum', 'Tarmuwa',
      'Yunusari', 'Yusufari',
    ],
  },
  {
    name: 'Zamfara', capital: 'Gusau', zone: 'North West', lgaCount: 14,
    lgas: [
      'Anka', 'Bakura', 'Birnin Magaji/Kiyaw', 'Bukkuyum', 'Bungudu', 'Gummi',
      'Gusau', 'Kaura Namoda', 'Maradun', 'Maru', 'Shinkafi', 'Talata Mafara',
      'Tsafe', 'Zurmi',
    ],
  },
];

/** Every local government in the country, with the state it belongs to. */
export interface NgLga { name: string; state: string; }

export const NG_LGAS: NgLga[] = NG_STATES.flatMap(s =>
  s.lgas.map(name => ({ name, state: s.name })),
);

/**
 * Prove the list rather than trust it.
 *
 * The constitutional total is 774: 768 local government areas plus the 6
 * FCT area councils. Each state declares its own count next to its list,
 * so a dropped or duplicated name shows up as a mismatch here rather than
 * as a town nobody can find six months from now.
 *
 * Returns problems instead of throwing. A geography file must never be
 * the reason an app fails to start.
 */
export function verifyGeography(): string[] {
  const problems: string[] = [];

  if (NG_STATES.length !== 37) {
    problems.push(`Expected 36 states and the FCT, found ${NG_STATES.length}.`);
  }

  let total = 0;
  for (const s of NG_STATES) {
    total += s.lgas.length;
    if (s.lgas.length !== s.lgaCount) {
      problems.push(`${s.name}: declares ${s.lgaCount} local governments but lists ${s.lgas.length}.`);
    }
    const seen = new Set<string>();
    for (const l of s.lgas) {
      const key = l.toLowerCase();
      if (seen.has(key)) problems.push(`${s.name}: "${l}" is listed twice.`);
      seen.add(key);
    }
  }
  if (total !== 774) {
    problems.push(`Expected 774 local governments in total, found ${total}.`);
  }

  return problems;
}

/** The state a local government belongs to, or null if we do not know it. */
export function stateOfLga(lga: string): string | null {
  const q = String(lga ?? '').trim().toLowerCase();
  if (!q) return null;
  const hit = NG_LGAS.find(l => l.name.toLowerCase() === q);
  return hit ? hit.state : null;
}

/**
 * Whether a name is a local government rather than a place people travel to.
 *
 * This is the Kajola test. Google returned "Kajola" as the city for
 * Obafemi Awolowo University, and Kajola is a real local government in
 * Oyo, so nothing looked wrong. Knowing it is an LGA is what lets the
 * derivation reject it and keep reading for the town.
 */
export function isLga(name: string): boolean {
  return stateOfLga(name) !== null;
}

/** A state by name, tolerant of a trailing "State". */
export function findState(name: string): NgState | null {
  const q = String(name ?? '').trim().replace(/\s+state$/i, '').toLowerCase();
  if (!q) return null;
  return NG_STATES.find(s => s.name.toLowerCase() === q) ?? null;
}
