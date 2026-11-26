# ⚾ Benito Juarez Men's League Platform

> Live at [benitojuarezbaseball.com](https://benitojuarezbaseball.com)

![Homepage screenshot](docs/screenshots/home.png)

## Overview

Benito Juarez Men's League is a 10-team baseball league with roughly 15–20 players per team, along with team managers and league administrators. Before the platform, league information and operations were spread across group chats and social media posts, making it harder to keep schedules, rosters, and updates in one place. I built a central website where players can follow the league and managers and admins can handle league operations online.

## Features

- Public schedules, standings, team rosters, and league announcements.
- Mobile-friendly pages for players and fans.
- Manager accounts and role-based access for team and league operations.
- Admin tools for maintaining league information and managing updates.
- Lineup and roster workflows, including CSV imports.
- Photo uploads and team imagery.

## How I Built It

The frontend uses React and TypeScript, and the API is built with FastAPI. PostgreSQL, hosted on Neon, stores the league data. The frontend and backend are deployed as separate Vercel projects, with the frontend calling the API for data and authenticated operations.

```mermaid
flowchart LR
    U[Players, managers, admins] --> W[React + TypeScript frontend]
    W --> A[FastAPI backend]
    A --> D[Neon PostgreSQL]


I chose a separate API so the web interface and data operations could evolve independently. PostgreSQL provides persistent shared data for league users, while TypeScript helps keep the frontend's data handling consistent.

## Challenges & Fixes

### Users on Xfinity could not open the site
Some users on Xfinity saw a browser security error, while the site worked on other networks and in Edge. I checked DNS and HTTPS behavior, confirmed the Vercel deployment and certificate were healthy, and traced the issue to Xfinity's CyberSecure filtering. I submitted the domain for reassessment and reviewed the site's security configuration. I also added security headers and a report-only Content Security Policy. The policy surfaced expected noise from the embedded Facebook content, which helped distinguish third-party behavior from a site-breaking issue.


### League domain setup

Connecting the league's existing domain required coordination with the league president and access to its registrar and DNS settings. The domain was managed through a separate provider, so the deployment and DNS configuration had to be coordinated rather than changed solely in the app.


### Moving from SQLite to PostgreSQL

SQLite was not a good fit for this deployment because the app needed durable, shared storage across serverless requests. I moved the application data to Neon PostgreSQL so updates would persist and be available consistently to the frontend and backend deployments.

## Results

- Supports a 10-team league with approximately 15–20 players per team, managers, and league administrators.
- Reaches roughly 1,000–1,200 visitors per week during the season.
- Replaced scattered league information with a platform used by real players, managers, and league leadership.
- The project helped me win MGM Floors as a paying website client.

## Demo

Coming Soon
