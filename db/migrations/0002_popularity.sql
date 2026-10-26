CREATE TABLE "keyword_metrics" (
	"keyword_id" integer NOT NULL,
	"store" "store" NOT NULL,
	"country" text NOT NULL,
	"popularity" integer,
	"prefix_length" integer,
	"popularity_at" timestamp with time zone,
	"difficulty" integer,
	"difficulty_at" timestamp with time zone,
	CONSTRAINT "keyword_metrics_keyword_id_store_country_pk" PRIMARY KEY("keyword_id","store","country")
);
--> statement-breakpoint
CREATE TABLE "keyword_trends" (
	"keyword_id" integer NOT NULL,
	"country" text NOT NULL,
	"points" jsonb,
	"error" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "keyword_trends_keyword_id_country_pk" PRIMARY KEY("keyword_id","country")
);
--> statement-breakpoint
ALTER TABLE "keyword_metrics" ADD CONSTRAINT "keyword_metrics_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_trends" ADD CONSTRAINT "keyword_trends_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE cascade ON UPDATE no action;