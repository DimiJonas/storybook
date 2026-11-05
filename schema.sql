--
-- PostgreSQL database dump
--

\restrict schema


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: book_1; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA book_1;


--
-- Name: book_2; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA book_2;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: images; Type: TABLE; Schema: book_1; Owner: -
--

CREATE TABLE book_1.images (
    id integer NOT NULL,
    memory_id integer,
    filename character varying(255) NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    width integer,
    height integer,
    place_id integer,
    place_checked boolean DEFAULT false NOT NULL,
    CONSTRAINT images_height_check CHECK ((height > 0)),
    CONSTRAINT images_width_check CHECK ((width > 0))
);


--
-- Name: images_id_seq; Type: SEQUENCE; Schema: book_1; Owner: -
--

CREATE SEQUENCE book_1.images_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: images_id_seq; Type: SEQUENCE OWNED BY; Schema: book_1; Owner: -
--

ALTER SEQUENCE book_1.images_id_seq OWNED BY book_1.images.id;


--
-- Name: important_dates; Type: TABLE; Schema: book_1; Owner: -
--

CREATE TABLE book_1.important_dates (
    id integer NOT NULL,
    user_id integer,
    title text NOT NULL,
    date date NOT NULL,
    recurring boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: important_dates_id_seq; Type: SEQUENCE; Schema: book_1; Owner: -
--

CREATE SEQUENCE book_1.important_dates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: important_dates_id_seq; Type: SEQUENCE OWNED BY; Schema: book_1; Owner: -
--

ALTER SEQUENCE book_1.important_dates_id_seq OWNED BY book_1.important_dates.id;


--
-- Name: memories; Type: TABLE; Schema: book_1; Owner: -
--

CREATE TABLE book_1.memories (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    content text,
    date date NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    user_id integer,
    mood character varying(32),
    updated_at timestamp without time zone,
    end_date date,
    cover_image_id integer,
    highlight boolean DEFAULT false NOT NULL,
    CONSTRAINT memories_end_date_after_start CHECK (((end_date IS NULL) OR (end_date > date)))
);


--
-- Name: memories_id_seq; Type: SEQUENCE; Schema: book_1; Owner: -
--

CREATE SEQUENCE book_1.memories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: memories_id_seq; Type: SEQUENCE OWNED BY; Schema: book_1; Owner: -
--

ALTER SEQUENCE book_1.memories_id_seq OWNED BY book_1.memories.id;


--
-- Name: memory_history; Type: TABLE; Schema: book_1; Owner: -
--

CREATE TABLE book_1.memory_history (
    id integer NOT NULL,
    memory_id integer NOT NULL,
    user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    changes jsonb NOT NULL
);


--
-- Name: memory_history_id_seq; Type: SEQUENCE; Schema: book_1; Owner: -
--

CREATE SEQUENCE book_1.memory_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: memory_history_id_seq; Type: SEQUENCE OWNED BY; Schema: book_1; Owner: -
--

ALTER SEQUENCE book_1.memory_history_id_seq OWNED BY book_1.memory_history.id;


--
-- Name: memory_places; Type: TABLE; Schema: book_1; Owner: -
--

CREATE TABLE book_1.memory_places (
    memory_id integer NOT NULL,
    place_id integer NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    from_photos boolean DEFAULT false NOT NULL
);


--
-- Name: memory_tags; Type: TABLE; Schema: book_1; Owner: -
--

CREATE TABLE book_1.memory_tags (
    memory_id integer NOT NULL,
    tag_id integer NOT NULL
);


--
-- Name: mood_emojis; Type: TABLE; Schema: book_1; Owner: -
--

CREATE TABLE book_1.mood_emojis (
    id integer NOT NULL,
    emoji character varying(32) NOT NULL,
    mood_group character varying(20) NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mood_emojis_emoji_check CHECK (((emoji)::text <> ''::text)),
    CONSTRAINT mood_emojis_mood_group_check CHECK (((mood_group)::text = ANY ((ARRAY['gluecklich'::character varying, 'verliebt'::character varying, 'entspannt'::character varying, 'abenteuer'::character varying, 'nachdenklich'::character varying, 'schwierig'::character varying])::text[])))
);


--
-- Name: mood_emojis_id_seq; Type: SEQUENCE; Schema: book_1; Owner: -
--

CREATE SEQUENCE book_1.mood_emojis_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mood_emojis_id_seq; Type: SEQUENCE OWNED BY; Schema: book_1; Owner: -
--

ALTER SEQUENCE book_1.mood_emojis_id_seq OWNED BY book_1.mood_emojis.id;


--
-- Name: perspectives; Type: TABLE; Schema: book_1; Owner: -
--

CREATE TABLE book_1.perspectives (
    id integer NOT NULL,
    memory_id integer NOT NULL,
    author_id integer NOT NULL,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT perspectives_text_check CHECK ((text <> ''::text))
);


--
-- Name: perspectives_id_seq; Type: SEQUENCE; Schema: book_1; Owner: -
--

CREATE SEQUENCE book_1.perspectives_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: perspectives_id_seq; Type: SEQUENCE OWNED BY; Schema: book_1; Owner: -
--

ALTER SEQUENCE book_1.perspectives_id_seq OWNED BY book_1.perspectives.id;


--
-- Name: phases; Type: TABLE; Schema: book_1; Owner: -
--

CREATE TABLE book_1.phases (
    id integer NOT NULL,
    title character varying(100) NOT NULL,
    emoji character varying(32),
    start_date date NOT NULL,
    user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: phases_id_seq; Type: SEQUENCE; Schema: book_1; Owner: -
--

CREATE SEQUENCE book_1.phases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: phases_id_seq; Type: SEQUENCE OWNED BY; Schema: book_1; Owner: -
--

ALTER SEQUENCE book_1.phases_id_seq OWNED BY book_1.phases.id;


--
-- Name: places; Type: TABLE; Schema: book_1; Owner: -
--

CREATE TABLE book_1.places (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    osm_key character varying(40),
    user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT places_latitude_check CHECK (((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision))),
    CONSTRAINT places_longitude_check CHECK (((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision))),
    CONSTRAINT places_name_check CHECK (((name)::text <> ''::text))
);


--
-- Name: places_id_seq; Type: SEQUENCE; Schema: book_1; Owner: -
--

CREATE SEQUENCE book_1.places_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: places_id_seq; Type: SEQUENCE OWNED BY; Schema: book_1; Owner: -
--

ALTER SEQUENCE book_1.places_id_seq OWNED BY book_1.places.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: book_1; Owner: -
--

CREATE TABLE book_1.schema_migrations (
    name text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: storybook_info; Type: TABLE; Schema: book_1; Owner: -
--

CREATE TABLE book_1.storybook_info (
    id integer DEFAULT 1 NOT NULL,
    name character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT storybook_info_id_check CHECK ((id = 1))
);


--
-- Name: tags; Type: TABLE; Schema: book_1; Owner: -
--

CREATE TABLE book_1.tags (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tags_id_seq; Type: SEQUENCE; Schema: book_1; Owner: -
--

CREATE SEQUENCE book_1.tags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tags_id_seq; Type: SEQUENCE OWNED BY; Schema: book_1; Owner: -
--

ALTER SEQUENCE book_1.tags_id_seq OWNED BY book_1.tags.id;


--
-- Name: images; Type: TABLE; Schema: book_2; Owner: -
--

CREATE TABLE book_2.images (
    id integer NOT NULL,
    memory_id integer,
    filename character varying(255) NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    width integer,
    height integer,
    place_id integer,
    place_checked boolean DEFAULT false NOT NULL,
    CONSTRAINT images_height_check CHECK ((height > 0)),
    CONSTRAINT images_width_check CHECK ((width > 0))
);


--
-- Name: images_id_seq; Type: SEQUENCE; Schema: book_2; Owner: -
--

CREATE SEQUENCE book_2.images_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: images_id_seq; Type: SEQUENCE OWNED BY; Schema: book_2; Owner: -
--

ALTER SEQUENCE book_2.images_id_seq OWNED BY book_2.images.id;


--
-- Name: important_dates; Type: TABLE; Schema: book_2; Owner: -
--

CREATE TABLE book_2.important_dates (
    id integer NOT NULL,
    user_id integer,
    title text NOT NULL,
    date date NOT NULL,
    recurring boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: important_dates_id_seq; Type: SEQUENCE; Schema: book_2; Owner: -
--

CREATE SEQUENCE book_2.important_dates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: important_dates_id_seq; Type: SEQUENCE OWNED BY; Schema: book_2; Owner: -
--

ALTER SEQUENCE book_2.important_dates_id_seq OWNED BY book_2.important_dates.id;


--
-- Name: memories; Type: TABLE; Schema: book_2; Owner: -
--

CREATE TABLE book_2.memories (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    content text,
    date date NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    user_id integer,
    mood character varying(32),
    updated_at timestamp without time zone,
    end_date date,
    cover_image_id integer,
    highlight boolean DEFAULT false NOT NULL,
    CONSTRAINT memories_end_date_after_start CHECK (((end_date IS NULL) OR (end_date > date)))
);


--
-- Name: memories_id_seq; Type: SEQUENCE; Schema: book_2; Owner: -
--

CREATE SEQUENCE book_2.memories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: memories_id_seq; Type: SEQUENCE OWNED BY; Schema: book_2; Owner: -
--

ALTER SEQUENCE book_2.memories_id_seq OWNED BY book_2.memories.id;


--
-- Name: memory_history; Type: TABLE; Schema: book_2; Owner: -
--

CREATE TABLE book_2.memory_history (
    id integer NOT NULL,
    memory_id integer NOT NULL,
    user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    changes jsonb NOT NULL
);


--
-- Name: memory_history_id_seq; Type: SEQUENCE; Schema: book_2; Owner: -
--

CREATE SEQUENCE book_2.memory_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: memory_history_id_seq; Type: SEQUENCE OWNED BY; Schema: book_2; Owner: -
--

ALTER SEQUENCE book_2.memory_history_id_seq OWNED BY book_2.memory_history.id;


--
-- Name: memory_places; Type: TABLE; Schema: book_2; Owner: -
--

CREATE TABLE book_2.memory_places (
    memory_id integer NOT NULL,
    place_id integer NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    from_photos boolean DEFAULT false NOT NULL
);


--
-- Name: memory_tags; Type: TABLE; Schema: book_2; Owner: -
--

CREATE TABLE book_2.memory_tags (
    memory_id integer NOT NULL,
    tag_id integer NOT NULL
);


--
-- Name: mood_emojis; Type: TABLE; Schema: book_2; Owner: -
--

CREATE TABLE book_2.mood_emojis (
    id integer NOT NULL,
    emoji character varying(32) NOT NULL,
    mood_group character varying(20) NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mood_emojis_emoji_check CHECK (((emoji)::text <> ''::text)),
    CONSTRAINT mood_emojis_mood_group_check CHECK (((mood_group)::text = ANY ((ARRAY['gluecklich'::character varying, 'verliebt'::character varying, 'entspannt'::character varying, 'abenteuer'::character varying, 'nachdenklich'::character varying, 'schwierig'::character varying])::text[])))
);


--
-- Name: mood_emojis_id_seq; Type: SEQUENCE; Schema: book_2; Owner: -
--

CREATE SEQUENCE book_2.mood_emojis_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mood_emojis_id_seq; Type: SEQUENCE OWNED BY; Schema: book_2; Owner: -
--

ALTER SEQUENCE book_2.mood_emojis_id_seq OWNED BY book_2.mood_emojis.id;


--
-- Name: perspectives; Type: TABLE; Schema: book_2; Owner: -
--

CREATE TABLE book_2.perspectives (
    id integer NOT NULL,
    memory_id integer NOT NULL,
    author_id integer NOT NULL,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT perspectives_text_check CHECK ((text <> ''::text))
);


--
-- Name: perspectives_id_seq; Type: SEQUENCE; Schema: book_2; Owner: -
--

CREATE SEQUENCE book_2.perspectives_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: perspectives_id_seq; Type: SEQUENCE OWNED BY; Schema: book_2; Owner: -
--

ALTER SEQUENCE book_2.perspectives_id_seq OWNED BY book_2.perspectives.id;


--
-- Name: phases; Type: TABLE; Schema: book_2; Owner: -
--

CREATE TABLE book_2.phases (
    id integer NOT NULL,
    title character varying(100) NOT NULL,
    emoji character varying(32),
    start_date date NOT NULL,
    user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: phases_id_seq; Type: SEQUENCE; Schema: book_2; Owner: -
--

CREATE SEQUENCE book_2.phases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: phases_id_seq; Type: SEQUENCE OWNED BY; Schema: book_2; Owner: -
--

ALTER SEQUENCE book_2.phases_id_seq OWNED BY book_2.phases.id;


--
-- Name: places; Type: TABLE; Schema: book_2; Owner: -
--

CREATE TABLE book_2.places (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    osm_key character varying(40),
    user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT places_latitude_check CHECK (((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision))),
    CONSTRAINT places_longitude_check CHECK (((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision))),
    CONSTRAINT places_name_check CHECK (((name)::text <> ''::text))
);


--
-- Name: places_id_seq; Type: SEQUENCE; Schema: book_2; Owner: -
--

CREATE SEQUENCE book_2.places_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: places_id_seq; Type: SEQUENCE OWNED BY; Schema: book_2; Owner: -
--

ALTER SEQUENCE book_2.places_id_seq OWNED BY book_2.places.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: book_2; Owner: -
--

CREATE TABLE book_2.schema_migrations (
    name text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: storybook_info; Type: TABLE; Schema: book_2; Owner: -
--

CREATE TABLE book_2.storybook_info (
    id integer DEFAULT 1 NOT NULL,
    name character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT storybook_info_id_check CHECK ((id = 1))
);


--
-- Name: tags; Type: TABLE; Schema: book_2; Owner: -
--

CREATE TABLE book_2.tags (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tags_id_seq; Type: SEQUENCE; Schema: book_2; Owner: -
--

CREATE SEQUENCE book_2.tags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tags_id_seq; Type: SEQUENCE OWNED BY; Schema: book_2; Owner: -
--

ALTER SEQUENCE book_2.tags_id_seq OWNED BY book_2.tags.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    name text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    token_hash character(64) NOT NULL,
    user_id integer NOT NULL,
    remember boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    device character varying(100)
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: images id; Type: DEFAULT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.images ALTER COLUMN id SET DEFAULT nextval('book_1.images_id_seq'::regclass);


--
-- Name: important_dates id; Type: DEFAULT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.important_dates ALTER COLUMN id SET DEFAULT nextval('book_1.important_dates_id_seq'::regclass);


--
-- Name: memories id; Type: DEFAULT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.memories ALTER COLUMN id SET DEFAULT nextval('book_1.memories_id_seq'::regclass);


--
-- Name: memory_history id; Type: DEFAULT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.memory_history ALTER COLUMN id SET DEFAULT nextval('book_1.memory_history_id_seq'::regclass);


--
-- Name: mood_emojis id; Type: DEFAULT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.mood_emojis ALTER COLUMN id SET DEFAULT nextval('book_1.mood_emojis_id_seq'::regclass);


--
-- Name: perspectives id; Type: DEFAULT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.perspectives ALTER COLUMN id SET DEFAULT nextval('book_1.perspectives_id_seq'::regclass);


--
-- Name: phases id; Type: DEFAULT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.phases ALTER COLUMN id SET DEFAULT nextval('book_1.phases_id_seq'::regclass);


--
-- Name: places id; Type: DEFAULT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.places ALTER COLUMN id SET DEFAULT nextval('book_1.places_id_seq'::regclass);


--
-- Name: tags id; Type: DEFAULT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.tags ALTER COLUMN id SET DEFAULT nextval('book_1.tags_id_seq'::regclass);


--
-- Name: images id; Type: DEFAULT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.images ALTER COLUMN id SET DEFAULT nextval('book_2.images_id_seq'::regclass);


--
-- Name: important_dates id; Type: DEFAULT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.important_dates ALTER COLUMN id SET DEFAULT nextval('book_2.important_dates_id_seq'::regclass);


--
-- Name: memories id; Type: DEFAULT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.memories ALTER COLUMN id SET DEFAULT nextval('book_2.memories_id_seq'::regclass);


--
-- Name: memory_history id; Type: DEFAULT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.memory_history ALTER COLUMN id SET DEFAULT nextval('book_2.memory_history_id_seq'::regclass);


--
-- Name: mood_emojis id; Type: DEFAULT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.mood_emojis ALTER COLUMN id SET DEFAULT nextval('book_2.mood_emojis_id_seq'::regclass);


--
-- Name: perspectives id; Type: DEFAULT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.perspectives ALTER COLUMN id SET DEFAULT nextval('book_2.perspectives_id_seq'::regclass);


--
-- Name: phases id; Type: DEFAULT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.phases ALTER COLUMN id SET DEFAULT nextval('book_2.phases_id_seq'::regclass);


--
-- Name: places id; Type: DEFAULT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.places ALTER COLUMN id SET DEFAULT nextval('book_2.places_id_seq'::regclass);


--
-- Name: tags id; Type: DEFAULT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.tags ALTER COLUMN id SET DEFAULT nextval('book_2.tags_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: images images_pkey; Type: CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.images
    ADD CONSTRAINT images_pkey PRIMARY KEY (id);


--
-- Name: important_dates important_dates_pkey; Type: CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.important_dates
    ADD CONSTRAINT important_dates_pkey PRIMARY KEY (id);


--
-- Name: memories memories_pkey; Type: CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.memories
    ADD CONSTRAINT memories_pkey PRIMARY KEY (id);


--
-- Name: memory_history memory_history_pkey; Type: CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.memory_history
    ADD CONSTRAINT memory_history_pkey PRIMARY KEY (id);


--
-- Name: memory_places memory_places_pkey; Type: CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.memory_places
    ADD CONSTRAINT memory_places_pkey PRIMARY KEY (memory_id, place_id);


--
-- Name: memory_tags memory_tags_pkey; Type: CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.memory_tags
    ADD CONSTRAINT memory_tags_pkey PRIMARY KEY (memory_id, tag_id);


--
-- Name: mood_emojis mood_emojis_emoji_key; Type: CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.mood_emojis
    ADD CONSTRAINT mood_emojis_emoji_key UNIQUE (emoji);


--
-- Name: mood_emojis mood_emojis_pkey; Type: CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.mood_emojis
    ADD CONSTRAINT mood_emojis_pkey PRIMARY KEY (id);


--
-- Name: perspectives perspectives_memory_id_author_id_key; Type: CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.perspectives
    ADD CONSTRAINT perspectives_memory_id_author_id_key UNIQUE (memory_id, author_id);


--
-- Name: perspectives perspectives_pkey; Type: CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.perspectives
    ADD CONSTRAINT perspectives_pkey PRIMARY KEY (id);


--
-- Name: phases phases_pkey; Type: CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.phases
    ADD CONSTRAINT phases_pkey PRIMARY KEY (id);


--
-- Name: phases phases_start_date_key; Type: CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.phases
    ADD CONSTRAINT phases_start_date_key UNIQUE (start_date);


--
-- Name: places places_osm_key_key; Type: CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.places
    ADD CONSTRAINT places_osm_key_key UNIQUE (osm_key);


--
-- Name: places places_pkey; Type: CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.places
    ADD CONSTRAINT places_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (name);


--
-- Name: storybook_info storybook_info_pkey; Type: CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.storybook_info
    ADD CONSTRAINT storybook_info_pkey PRIMARY KEY (id);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: images images_pkey; Type: CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.images
    ADD CONSTRAINT images_pkey PRIMARY KEY (id);


--
-- Name: important_dates important_dates_pkey; Type: CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.important_dates
    ADD CONSTRAINT important_dates_pkey PRIMARY KEY (id);


--
-- Name: memories memories_pkey; Type: CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.memories
    ADD CONSTRAINT memories_pkey PRIMARY KEY (id);


--
-- Name: memory_history memory_history_pkey; Type: CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.memory_history
    ADD CONSTRAINT memory_history_pkey PRIMARY KEY (id);


--
-- Name: memory_places memory_places_pkey; Type: CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.memory_places
    ADD CONSTRAINT memory_places_pkey PRIMARY KEY (memory_id, place_id);


--
-- Name: memory_tags memory_tags_pkey; Type: CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.memory_tags
    ADD CONSTRAINT memory_tags_pkey PRIMARY KEY (memory_id, tag_id);


--
-- Name: mood_emojis mood_emojis_emoji_key; Type: CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.mood_emojis
    ADD CONSTRAINT mood_emojis_emoji_key UNIQUE (emoji);


--
-- Name: mood_emojis mood_emojis_pkey; Type: CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.mood_emojis
    ADD CONSTRAINT mood_emojis_pkey PRIMARY KEY (id);


--
-- Name: perspectives perspectives_memory_id_author_id_key; Type: CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.perspectives
    ADD CONSTRAINT perspectives_memory_id_author_id_key UNIQUE (memory_id, author_id);


--
-- Name: perspectives perspectives_pkey; Type: CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.perspectives
    ADD CONSTRAINT perspectives_pkey PRIMARY KEY (id);


--
-- Name: phases phases_pkey; Type: CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.phases
    ADD CONSTRAINT phases_pkey PRIMARY KEY (id);


--
-- Name: phases phases_start_date_key; Type: CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.phases
    ADD CONSTRAINT phases_start_date_key UNIQUE (start_date);


--
-- Name: places places_osm_key_key; Type: CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.places
    ADD CONSTRAINT places_osm_key_key UNIQUE (osm_key);


--
-- Name: places places_pkey; Type: CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.places
    ADD CONSTRAINT places_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (name);


--
-- Name: storybook_info storybook_info_pkey; Type: CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.storybook_info
    ADD CONSTRAINT storybook_info_pkey PRIMARY KEY (id);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (name);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (token_hash);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: images_memory_id_display_order_idx; Type: INDEX; Schema: book_1; Owner: -
--

CREATE INDEX images_memory_id_display_order_idx ON book_1.images USING btree (memory_id, display_order);


--
-- Name: memory_history_memory_id_idx; Type: INDEX; Schema: book_1; Owner: -
--

CREATE INDEX memory_history_memory_id_idx ON book_1.memory_history USING btree (memory_id, id);


--
-- Name: memory_places_place_id_idx; Type: INDEX; Schema: book_1; Owner: -
--

CREATE INDEX memory_places_place_id_idx ON book_1.memory_places USING btree (place_id);


--
-- Name: memory_tags_tag_id_idx; Type: INDEX; Schema: book_1; Owner: -
--

CREATE INDEX memory_tags_tag_id_idx ON book_1.memory_tags USING btree (tag_id);


--
-- Name: tags_name_key; Type: INDEX; Schema: book_1; Owner: -
--

CREATE UNIQUE INDEX tags_name_key ON book_1.tags USING btree (lower((name)::text));


--
-- Name: images_memory_id_display_order_idx; Type: INDEX; Schema: book_2; Owner: -
--

CREATE INDEX images_memory_id_display_order_idx ON book_2.images USING btree (memory_id, display_order);


--
-- Name: memory_history_memory_id_idx; Type: INDEX; Schema: book_2; Owner: -
--

CREATE INDEX memory_history_memory_id_idx ON book_2.memory_history USING btree (memory_id, id);


--
-- Name: memory_places_place_id_idx; Type: INDEX; Schema: book_2; Owner: -
--

CREATE INDEX memory_places_place_id_idx ON book_2.memory_places USING btree (place_id);


--
-- Name: memory_tags_tag_id_idx; Type: INDEX; Schema: book_2; Owner: -
--

CREATE INDEX memory_tags_tag_id_idx ON book_2.memory_tags USING btree (tag_id);


--
-- Name: tags_name_key; Type: INDEX; Schema: book_2; Owner: -
--

CREATE UNIQUE INDEX tags_name_key ON book_2.tags USING btree (lower((name)::text));


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id);


--
-- Name: images images_memory_id_fkey; Type: FK CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.images
    ADD CONSTRAINT images_memory_id_fkey FOREIGN KEY (memory_id) REFERENCES book_1.memories(id) ON DELETE CASCADE;


--
-- Name: images images_place_id_fkey; Type: FK CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.images
    ADD CONSTRAINT images_place_id_fkey FOREIGN KEY (place_id) REFERENCES book_1.places(id) ON DELETE SET NULL;


--
-- Name: important_dates important_dates_user_id_fkey; Type: FK CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.important_dates
    ADD CONSTRAINT important_dates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: memories memories_cover_image_id_fkey; Type: FK CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.memories
    ADD CONSTRAINT memories_cover_image_id_fkey FOREIGN KEY (cover_image_id) REFERENCES book_1.images(id) ON DELETE SET NULL;


--
-- Name: memories memories_user_id_fkey; Type: FK CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.memories
    ADD CONSTRAINT memories_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: memory_history memory_history_memory_id_fkey; Type: FK CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.memory_history
    ADD CONSTRAINT memory_history_memory_id_fkey FOREIGN KEY (memory_id) REFERENCES book_1.memories(id) ON DELETE CASCADE;


--
-- Name: memory_history memory_history_user_id_fkey; Type: FK CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.memory_history
    ADD CONSTRAINT memory_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: memory_places memory_places_memory_id_fkey; Type: FK CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.memory_places
    ADD CONSTRAINT memory_places_memory_id_fkey FOREIGN KEY (memory_id) REFERENCES book_1.memories(id) ON DELETE CASCADE;


--
-- Name: memory_places memory_places_place_id_fkey; Type: FK CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.memory_places
    ADD CONSTRAINT memory_places_place_id_fkey FOREIGN KEY (place_id) REFERENCES book_1.places(id) ON DELETE CASCADE;


--
-- Name: memory_tags memory_tags_memory_id_fkey; Type: FK CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.memory_tags
    ADD CONSTRAINT memory_tags_memory_id_fkey FOREIGN KEY (memory_id) REFERENCES book_1.memories(id) ON DELETE CASCADE;


--
-- Name: memory_tags memory_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.memory_tags
    ADD CONSTRAINT memory_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES book_1.tags(id) ON DELETE CASCADE;


--
-- Name: mood_emojis mood_emojis_user_id_fkey; Type: FK CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.mood_emojis
    ADD CONSTRAINT mood_emojis_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: perspectives perspectives_author_id_fkey; Type: FK CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.perspectives
    ADD CONSTRAINT perspectives_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: perspectives perspectives_memory_id_fkey; Type: FK CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.perspectives
    ADD CONSTRAINT perspectives_memory_id_fkey FOREIGN KEY (memory_id) REFERENCES book_1.memories(id) ON DELETE CASCADE;


--
-- Name: phases phases_user_id_fkey; Type: FK CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.phases
    ADD CONSTRAINT phases_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: places places_user_id_fkey; Type: FK CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.places
    ADD CONSTRAINT places_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: tags tags_user_id_fkey; Type: FK CONSTRAINT; Schema: book_1; Owner: -
--

ALTER TABLE ONLY book_1.tags
    ADD CONSTRAINT tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: images images_memory_id_fkey; Type: FK CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.images
    ADD CONSTRAINT images_memory_id_fkey FOREIGN KEY (memory_id) REFERENCES book_2.memories(id) ON DELETE CASCADE;


--
-- Name: images images_place_id_fkey; Type: FK CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.images
    ADD CONSTRAINT images_place_id_fkey FOREIGN KEY (place_id) REFERENCES book_2.places(id) ON DELETE SET NULL;


--
-- Name: important_dates important_dates_user_id_fkey; Type: FK CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.important_dates
    ADD CONSTRAINT important_dates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: memories memories_cover_image_id_fkey; Type: FK CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.memories
    ADD CONSTRAINT memories_cover_image_id_fkey FOREIGN KEY (cover_image_id) REFERENCES book_2.images(id) ON DELETE SET NULL;


--
-- Name: memories memories_user_id_fkey; Type: FK CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.memories
    ADD CONSTRAINT memories_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: memory_history memory_history_memory_id_fkey; Type: FK CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.memory_history
    ADD CONSTRAINT memory_history_memory_id_fkey FOREIGN KEY (memory_id) REFERENCES book_2.memories(id) ON DELETE CASCADE;


--
-- Name: memory_history memory_history_user_id_fkey; Type: FK CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.memory_history
    ADD CONSTRAINT memory_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: memory_places memory_places_memory_id_fkey; Type: FK CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.memory_places
    ADD CONSTRAINT memory_places_memory_id_fkey FOREIGN KEY (memory_id) REFERENCES book_2.memories(id) ON DELETE CASCADE;


--
-- Name: memory_places memory_places_place_id_fkey; Type: FK CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.memory_places
    ADD CONSTRAINT memory_places_place_id_fkey FOREIGN KEY (place_id) REFERENCES book_2.places(id) ON DELETE CASCADE;


--
-- Name: memory_tags memory_tags_memory_id_fkey; Type: FK CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.memory_tags
    ADD CONSTRAINT memory_tags_memory_id_fkey FOREIGN KEY (memory_id) REFERENCES book_2.memories(id) ON DELETE CASCADE;


--
-- Name: memory_tags memory_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.memory_tags
    ADD CONSTRAINT memory_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES book_2.tags(id) ON DELETE CASCADE;


--
-- Name: mood_emojis mood_emojis_user_id_fkey; Type: FK CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.mood_emojis
    ADD CONSTRAINT mood_emojis_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: perspectives perspectives_author_id_fkey; Type: FK CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.perspectives
    ADD CONSTRAINT perspectives_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: perspectives perspectives_memory_id_fkey; Type: FK CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.perspectives
    ADD CONSTRAINT perspectives_memory_id_fkey FOREIGN KEY (memory_id) REFERENCES book_2.memories(id) ON DELETE CASCADE;


--
-- Name: phases phases_user_id_fkey; Type: FK CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.phases
    ADD CONSTRAINT phases_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: places places_user_id_fkey; Type: FK CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.places
    ADD CONSTRAINT places_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: tags tags_user_id_fkey; Type: FK CONSTRAINT; Schema: book_2; Owner: -
--

ALTER TABLE ONLY book_2.tags
    ADD CONSTRAINT tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict schema

