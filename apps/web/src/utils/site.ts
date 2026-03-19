export type SocialLink = {
  label: string;
  icon: "facebook" | "youtube";
  href: string;
};

export const leagueProfile = {
  name: "Benito Juarez Men's Baseball League",
  shortName: "Benito Juarez Men's League",
  about:
    "Chicago's Benito Juarez Men's Baseball League brings together local teams, weekly competition, and community baseball all season long.",
  email: "league@benitojuarezmensleague.com",
  socials: [
    {
      label: "Facebook",
      icon: "facebook",
      href: "https://www.facebook.com/bjmbl.chicago",
    },
    {
      label: "YouTube",
      icon: "youtube",
      href: "https://www.youtube.com/@BenitoJuarezBaseballLeague",
    },
  ] satisfies SocialLink[],
} as const;
