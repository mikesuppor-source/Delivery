/**
 * Lebanese Administrative Geographic Divisions (Governorates, Cazas, Towns)
 * Matches standard Lebanese logistics format: Governorate - Caza - Town (المحافظة - القضاء - البلدة)
 */

export interface LebaneseCaza {
  id: string;
  nameEn: string;
  nameAr: string;
  towns: Array<{ nameEn: string; nameAr: string }>;
}

export interface LebaneseGovernorate {
  id: string;
  nameEn: string;
  nameAr: string;
  cazas: LebaneseCaza[];
}

export const LEBANON_GEO: LebaneseGovernorate[] = [
  {
    id: 'beirut',
    nameEn: 'Beirut',
    nameAr: 'بيروت',
    cazas: [
      {
        id: 'beirut',
        nameEn: 'Beirut',
        nameAr: 'بيروت',
        towns: [
          { nameEn: 'Achrafieh', nameAr: 'الأشرفية' },
          { nameEn: 'Hamra', nameAr: 'الحمرا' },
          { nameEn: 'Ras Beirut', nameAr: 'رأس بيروت' },
          { nameEn: 'Mar Mikhael', nameAr: 'مار مخايل' },
          { nameEn: 'Badaro', nameAr: 'بدارو' },
          { nameEn: 'Verdun', nameAr: 'فردان' },
          { nameEn: 'Ain El Mreisseh', nameAr: 'عين المريسة' },
          { nameEn: 'Tariq El Jdideh', nameAr: 'طريق الجديدة' },
          { nameEn: 'Mazraa', nameAr: 'المزرعة' },
          { nameEn: 'Bachoura', nameAr: 'الباشورة' },
          { nameEn: 'Gemmayzeh', nameAr: 'الجميزة' },
          { nameEn: 'Downtown / Beirut Central District', nameAr: 'وسط بيروت' },
          { nameEn: 'Minet El Hosn', nameAr: 'مينة الحصن' },
          { nameEn: 'Zokak El Blat', nameAr: 'زقاق البلاط' },
          { nameEn: 'Mousaitbeh', nameAr: 'المصيطبة' },
        ],
      },
    ],
  },
  {
    id: 'mount_lebanon',
    nameEn: 'Mount Lebanon',
    nameAr: 'جبل لبنان',
    cazas: [
      {
        id: 'baabda',
        nameEn: 'Baabda',
        nameAr: 'بعبدا',
        towns: [
          { nameEn: 'Baabda', nameAr: 'بعبدا' },
          { nameEn: 'Hazmieh', nameAr: 'الحازمية' },
          { nameEn: 'Hadath', nameAr: 'الحدث' },
          { nameEn: 'Furn El Chebbak', nameAr: 'فرن الشباك' },
          { nameEn: 'Chiyah', nameAr: 'الشياح' },
          { nameEn: 'Ghobeiry', nameAr: 'الغبيري' },
          { nameEn: 'Haret Hreik', nameAr: 'حارة حريك' },
          { nameEn: 'Yarze', nameAr: 'يرزة' },
          { nameEn: 'Jamhour', nameAr: 'الجمهور' },
          { nameEn: 'Kfarchima', nameAr: 'كفرشيما' },
        ],
      },
      {
        id: 'metn',
        nameEn: 'Metn',
        nameAr: 'المتن',
        towns: [
          { nameEn: 'Jdeideh', nameAr: 'الجديدة' },
          { nameEn: 'Antelias', nameAr: 'أنطلياس' },
          { nameEn: 'Sin El Fil', nameAr: 'سن الفيل' },
          { nameEn: 'Dbayeh', nameAr: 'الضبية' },
          { nameEn: 'Jal El Dib', nameAr: 'جل الديب' },
          { nameEn: 'Mansourieh', nameAr: 'المنصورية' },
          { nameEn: 'Broummana', nameAr: 'برمانا' },
          { nameEn: 'Beit Mery', nameAr: 'بيت مري' },
          { nameEn: 'Bikfaya', nameAr: 'بكفيا' },
          { nameEn: 'Dekwaneh', nameAr: 'الدكوانة' },
          { nameEn: 'Bsalim', nameAr: 'بصاليم' },
          { nameEn: 'Fanar', nameAr: 'الفنار' },
          { nameEn: 'Rabieh', nameAr: 'الرابية' },
        ],
      },
      {
        id: 'keserwan',
        nameEn: 'Keserwan',
        nameAr: 'كسروان',
        towns: [
          { nameEn: 'Jounieh', nameAr: 'جونيه' },
          { nameEn: 'Kaslik', nameAr: 'الكسليك' },
          { nameEn: 'Zouk Mikael', nameAr: 'زوق مكايل' },
          { nameEn: 'Zouk Mosbeh', nameAr: 'زوق مصبح' },
          { nameEn: 'Sarba', nameAr: 'صربا' },
          { nameEn: 'Ghosta', nameAr: 'غوسطا' },
          { nameEn: 'Ajaltoun', nameAr: 'عجلتون' },
          { nameEn: 'Faraya', nameAr: 'فاريا' },
          { nameEn: 'Kfardebian', nameAr: 'كفردبيان' },
          { nameEn: 'Tabarja', nameAr: 'طبرجا' },
          { nameEn: 'Safra', nameAr: 'الصفرا' },
        ],
      },
      {
        id: 'aley',
        nameEn: 'Aley',
        nameAr: 'عاليه',
        towns: [
          { nameEn: 'Aley', nameAr: 'عاليه' },
          { nameEn: 'Bhamdoun', nameAr: 'بحمدون' },
          { nameEn: 'Souk El Gharb', nameAr: 'سوق الغرب' },
          { nameEn: 'Choueifat', nameAr: 'الشويفات' },
          { nameEn: 'Khalde', nameAr: 'خلدة' },
          { nameEn: 'Kahale', nameAr: 'الكحالة' },
          { nameEn: 'Bdedoun', nameAr: 'بدادون' },
          { nameEn: 'Aramoun', nameAr: 'عرمون' },
          { nameEn: 'Bchamoun', nameAr: 'بشامون' },
        ],
      },
      {
        id: 'chouf',
        nameEn: 'Chouf',
        nameAr: 'الشوف',
        towns: [
          { nameEn: 'Damour', nameAr: 'الدامور' },
          { nameEn: 'Deir El Qamar', nameAr: 'دير القمر' },
          { nameEn: 'Beiteddine', nameAr: 'بيت الدين' },
          { nameEn: 'Baakline', nameAr: 'بعقلين' },
          { nameEn: 'Barouk', nameAr: 'الباروك' },
          { nameEn: 'Naameh', nameAr: 'الناعمة' },
          { nameEn: 'Jiyeh', nameAr: 'الجية' },
          { nameEn: 'Sheheem', nameAr: 'شحيم' },
          { nameEn: 'Semqanieh', nameAr: 'السمقانية' },
        ],
      },
      {
        id: 'jbeil',
        nameEn: 'Jbeil (Byblos)',
        nameAr: 'جبيل',
        towns: [
          { nameEn: 'Jbeil', nameAr: 'جبيل' },
          { nameEn: 'Amchit', nameAr: 'عمشيت' },
          { nameEn: 'Nahr Ibrahim', nameAr: 'نهر إبراهيم' },
          { nameEn: 'Fidar', nameAr: 'الفيدار' },
          { nameEn: 'Halat', nameAr: 'حالات' },
          { nameEn: 'Ehmej', nameAr: 'إهمج' },
          { nameEn: 'Kartaba', nameAr: 'قرطبا' },
        ],
      },
    ],
  },
  {
    id: 'north_lebanon',
    nameEn: 'North Lebanon',
    nameAr: 'الشمال',
    cazas: [
      {
        id: 'tripoli',
        nameEn: 'Tripoli',
        nameAr: 'طرابلس',
        towns: [
          { nameEn: 'Tripoli', nameAr: 'طرابلس' },
          { nameEn: 'El Mina', nameAr: 'الميناء' },
          { nameEn: 'Qalamoun', nameAr: 'القلمون' },
          { nameEn: 'Beddawi', nameAr: 'البداوي' },
        ],
      },
      {
        id: 'koura',
        nameEn: 'Koura',
        nameAr: 'الكورة',
        towns: [
          { nameEn: 'Amioun', nameAr: 'أميون' },
          { nameEn: 'Kousba', nameAr: 'كوسبا' },
          { nameEn: 'Chekka', nameAr: 'شكا' },
          { nameEn: 'Anfeh', nameAr: 'أنفه' },
        ],
      },
      {
        id: 'batroun',
        nameEn: 'Batroun',
        nameAr: 'البترون',
        towns: [
          { nameEn: 'Batroun', nameAr: 'البترون' },
          { nameEn: 'Tannourine', nameAr: 'تنورين' },
          { nameEn: 'Douma', nameAr: 'دوما' },
          { nameEn: 'Kfifane', nameAr: 'كفيفان' },
        ],
      },
      {
        id: 'zgharta',
        nameEn: 'Zgharta',
        nameAr: 'زغرتا',
        towns: [
          { nameEn: 'Zgharta', nameAr: 'زغرتا' },
          { nameEn: 'Ehden', nameAr: 'إهدن' },
          { nameEn: 'Meziara', nameAr: 'مزيارة' },
        ],
      },
      {
        id: 'bcharre',
        nameEn: 'Bcharre',
        nameAr: 'بشري',
        towns: [
          { nameEn: 'Bcharre', nameAr: 'بشري' },
          { nameEn: 'Hasroun', nameAr: 'حصرون' },
          { nameEn: 'Hadchit', nameAr: 'حدشيت' },
        ],
      },
      {
        id: 'minieh_dinnieh',
        nameEn: 'Minieh-Dinnieh',
        nameAr: 'المنية - الضنية',
        towns: [
          { nameEn: 'Minieh', nameAr: 'المنية' },
          { nameEn: 'Sir Ed-Danniyeh', nameAr: 'سير الضنية' },
          { nameEn: 'Bakhoun', nameAr: 'بخعون' },
        ],
      },
    ],
  },
  {
    id: 'akkar',
    nameEn: 'Akkar',
    nameAr: 'عكار',
    cazas: [
      {
        id: 'akkar',
        nameEn: 'Akkar',
        nameAr: 'عكار',
        towns: [
          { nameEn: 'Halba', nameAr: 'حلبا' },
          { nameEn: 'Qobayat', nameAr: 'القبيات' },
          { nameEn: 'Bebnine', nameAr: 'ببنين' },
          { nameEn: 'Berkayel', nameAr: 'برقايل' },
          { nameEn: 'Rahbeh', nameAr: 'رحبة' },
        ],
      },
    ],
  },
  {
    id: 'bekaa',
    nameEn: 'Bekaa',
    nameAr: 'البقاع',
    cazas: [
      {
        id: 'zahle',
        nameEn: 'Zahle',
        nameAr: 'زحلة',
        towns: [
          { nameEn: 'Zahle', nameAr: 'زحلة' },
          { nameEn: 'Chtaura', nameAr: 'شتورا' },
          { nameEn: 'Rayak', nameAr: 'رياق' },
          { nameEn: 'Saadnayel', nameAr: 'سعدنايل' },
          { nameEn: 'Taalabaya', nameAr: 'تعلبايا' },
          { nameEn: 'Bar Elias', nameAr: 'بر الياس' },
          { nameEn: 'Qaa El Rim', nameAr: 'قاع الريم' },
        ],
      },
      {
        id: 'west_bekaa',
        nameEn: 'West Bekaa',
        nameAr: 'البقاع الغربي',
        towns: [
          { nameEn: 'Jeb Jannine', nameAr: 'جب جنين' },
          { nameEn: 'Saghbine', nameAr: 'صغبين' },
          { nameEn: 'Qaraoun', nameAr: 'القرعون' },
          { nameEn: 'Machghara', nameAr: 'مشغرة' },
          { nameEn: 'Kamed El Loz', nameAr: 'كامد اللوز' },
        ],
      },
      {
        id: 'rashaya',
        nameEn: 'Rashaya',
        nameAr: 'راشيا',
        towns: [
          { nameEn: 'Rashaya', nameAr: 'راشيا' },
          { nameEn: 'Hawch El Qinnabeh', nameAr: 'حوش القنعبة' },
          { nameEn: 'Bakka', nameAr: 'بكّا' },
          { nameEn: 'Ain Ata', nameAr: 'عين عطا' },
          { nameEn: 'Kfeir', nameAr: 'الكفير' },
        ],
      },
    ],
  },
  {
    id: 'baalbek_hermel',
    nameEn: 'Baalbek-Hermel',
    nameAr: 'بعلبك - الهرمل',
    cazas: [
      {
        id: 'baalbek',
        nameEn: 'Baalbek',
        nameAr: 'بعلبك',
        towns: [
          { nameEn: 'Baalbek', nameAr: 'بعلبك' },
          { nameEn: 'Brital', nameAr: 'بريتال' },
          { nameEn: 'Chmestar', nameAr: 'شمسطار' },
          { nameEn: 'Douris', nameAr: 'دورس' },
          { nameEn: 'Deir El Ahmar', nameAr: 'دير الأحمر' },
        ],
      },
      {
        id: 'hermel',
        nameEn: 'Hermel',
        nameAr: 'الهرمل',
        towns: [
          { nameEn: 'Hermel', nameAr: 'الهرمل' },
          { nameEn: 'Qasr', nameAr: 'القصر' },
          { nameEn: 'Chawaghir', nameAr: 'الشواغير' },
        ],
      },
    ],
  },
  {
    id: 'south_lebanon',
    nameEn: 'South Lebanon',
    nameAr: 'الجنوب',
    cazas: [
      {
        id: 'saida',
        nameEn: 'Saida (Sidon)',
        nameAr: 'صيدا',
        towns: [
          { nameEn: 'Saida', nameAr: 'صيدا' },
          { nameEn: 'Ghazieh', nameAr: 'الغازية' },
          { nameEn: 'Maghdouche', nameAr: 'مغدوشة' },
          { nameEn: 'Haret Saida', nameAr: 'حارة صيدا' },
          { nameEn: 'Abra', nameAr: 'عبرة' },
          { nameEn: 'Hilalieh', nameAr: 'الهلالية' },
        ],
      },
      {
        id: 'tyre',
        nameEn: 'Tyre',
        nameAr: 'صور',
        towns: [
          { nameEn: 'Tyre', nameAr: 'صور' },
          { nameEn: 'Abbasiyeh', nameAr: 'العباسية' },
          { nameEn: 'Bazourieh', nameAr: 'البازورية' },
          { nameEn: 'Qana', nameAr: 'قانا' },
          { nameEn: 'Naqoura', nameAr: 'الناقورة' },
          { nameEn: 'Jouaiyya', nameAr: 'جويا' },
        ],
      },
      {
        id: 'jezzine',
        nameEn: 'Jezzine',
        nameAr: 'جزين',
        towns: [
          { nameEn: 'Jezzine', nameAr: 'جزين' },
          { nameEn: 'Roum', nameAr: 'روم' },
          { nameEn: 'Bkassine', nameAr: 'بكاسين' },
        ],
      },
    ],
  },
  {
    id: 'nabatieh',
    nameEn: 'Nabatieh',
    nameAr: 'النبطية',
    cazas: [
      {
        id: 'nabatieh',
        nameEn: 'Nabatieh',
        nameAr: 'النبطية',
        towns: [
          { nameEn: 'Nabatieh', nameAr: 'النبطية' },
          { nameEn: 'Kfar Roummane', nameAr: 'كفر رمان' },
          { nameEn: 'Habbouch', nameAr: 'حبوش' },
          { nameEn: 'Doueir', nameAr: 'الدوير' },
        ],
      },
      {
        id: 'bint_jbeil',
        nameEn: 'Bint Jbeil',
        nameAr: 'بنت جبيل',
        towns: [
          { nameEn: 'Bint Jbeil', nameAr: 'بنت جبيل' },
          { nameEn: 'Tebnine', nameAr: 'تبنين' },
          { nameEn: 'Rmeich', nameAr: 'رميش' },
          { nameEn: 'Ain Ebel', nameAr: 'عين إبل' },
        ],
      },
      {
        id: 'marjeyoun',
        nameEn: 'Marjeyoun',
        nameAr: 'مرجعيون',
        towns: [
          { nameEn: 'Marjeyoun', nameAr: 'مرجعيون' },
          { nameEn: 'Khiam', nameAr: 'الخيام' },
          { nameEn: 'Kleaya', nameAr: 'القليعة' },
        ],
      },
      {
        id: 'hasbaya',
        nameEn: 'Hasbaya',
        nameAr: 'حاصبيا',
        towns: [
          { nameEn: 'Hasbaya', nameAr: 'حاصبيا' },
          { nameEn: 'Chebaa', nameAr: 'شبعا' },
          { nameEn: 'Kfar Chouba', nameAr: 'كفرشوبا' },
        ],
      },
    ],
  },
];

export interface TownSearchResult {
  governorateAr: string;
  governorateEn: string;
  cazaAr: string;
  cazaEn: string;
  townAr: string;
  townEn: string;
  formattedAr: string;
  formattedEn: string;
}

/**
 * Fast search across all Lebanese towns/villages by Arabic or English query
 */
export function searchLebaneseTowns(query: string, limit = 8): TownSearchResult[] {
  if (!query || query.trim().length < 2) return [];
  const q = query.trim().toLowerCase();

  const results: TownSearchResult[] = [];

  for (const gov of LEBANON_GEO) {
    for (const caza of gov.cazas) {
      for (const town of caza.towns) {
        if (
          town.nameAr.includes(q) ||
          town.nameEn.toLowerCase().includes(q) ||
          caza.nameAr.includes(q) ||
          caza.nameEn.toLowerCase().includes(q)
        ) {
          results.push({
            governorateAr: gov.nameAr,
            governorateEn: gov.nameEn,
            cazaAr: caza.nameAr,
            cazaEn: caza.nameEn,
            townAr: town.nameAr,
            townEn: town.nameEn,
            formattedAr: `${gov.nameAr} - ${caza.nameAr} - ${town.nameAr}`,
            formattedEn: `${gov.nameEn} - ${caza.nameEn} - ${town.nameEn}`,
          });

          if (results.length >= limit) return results;
        }
      }
    }
  }

  return results;
}

/**
 * Standard Lebanese logistics format: Governorate - Caza - Town
 */
export function formatLebaneseDestination(gov?: string | null, caza?: string | null, town?: string | null): string {
  const parts = [gov, caza, town].filter(Boolean);
  return parts.join(' - ');
}
