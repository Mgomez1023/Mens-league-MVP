export type SocialLink = {
  label: string;
  icon: "facebook" | "youtube";
  href: string;
};

export const facebookPageUrl = "https://www.facebook.com/bjmbl.chicago";

export const leagueProfile = {
  name: "Benito Juarez Men's Baseball League",
  shortName: "Benito Juarez Men's League",
  about:
    "Chicago's Benito Juarez Men's Baseball League brings together local teams, weekly competition, and community baseball all season long.",
  email: "BJMBL.BASEBALL@gmail.com",
  phone: "(630) 429-6232",
  phoneHref: "tel:630-429-6232",
  socials: [
    {
      label: "Facebook",
      icon: "facebook",
      href: facebookPageUrl,
    },
    {
      label: "YouTube",
      icon: "youtube",
      href: "https://www.youtube.com/@BenitoJuarezBaseballLeague",
    },
  ] satisfies SocialLink[],
} as const;
