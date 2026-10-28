import React from 'react';
import { Skeleton, configureBoneyard } from 'boneyard-js/react';

// Configure boneyard global defaults to match our high-contrast design tokens
configureBoneyard({
  color: '#E4E4E7',
  darkColor: '#27272A',
  animate: 'shimmer',
  shimmerColor: '#F4F4F5',
  darkShimmerColor: '#3F3F46',
  speed: '1.8s',
});

/**
 * Pixel-perfect ProjectListSkeleton matching the user reference wireframe:
 * - Row 1: 3 summary metric cards (icon square on left + 2 text lines on right)
 * - Row 2: Search input bar + Filter dropdown pill + Checkbox toggle + 2 View mode icon buttons
 * - Rows 3-4: 6 Project cards in a 3-column grid (3x2)
 */
export const ProjectListSkeleton: React.FC = () => {
  return (
    <div
      className="boneyard-skeleton-container"
      aria-busy="true"
      aria-label="Loading project workspaces"
      style={{ width: '100%' }}
    >
      {/* Row 1: 3 Summary Metric Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '0.85rem',
          marginBottom: '1.25rem',
        }}
      >
        {[1, 2, 3].map((cardId) => (
          <div
            key={cardId}
            className="boneyard-card-skeleton"
            style={{
              padding: '0.9rem 1rem',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-hairline)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
            }}
          >
            {/* Square avatar / icon placeholder */}
            <div
              className="boneyard-bone"
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                flexShrink: 0,
              }}
            />
            {/* Stacked lines: top wider, bottom narrower */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', flex: 1 }}>
              <div
                className="boneyard-bone"
                style={{
                  width: '90px',
                  height: '11px',
                  borderRadius: '9999px',
                }}
              />
              <div
                className="boneyard-bone"
                style={{
                  width: '55px',
                  height: '9px',
                  borderRadius: '9999px',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Row 2: Filter & Search Bar Skeleton */}
      <div
        className="boneyard-card-skeleton"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.65rem 0.85rem',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-hairline)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '1.25rem',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        {/* Search Input Container with Magnifying Glass Circle & Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            flex: '1 1 240px',
            minWidth: '200px',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-hairline)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.4rem 0.65rem',
            height: '32px',
          }}
        >
          <div
            className="boneyard-bone"
            style={{
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              flexShrink: 0,
            }}
          />
          <div
            className="boneyard-bone"
            style={{
              width: '55%',
              maxWidth: '260px',
              height: '10px',
              borderRadius: '9999px',
            }}
          />
        </div>

        {/* Right side filter, checkbox & view toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Dropdown pill with downward chevron */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-hairline)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.35rem 0.65rem',
              height: '32px',
            }}
          >
            <div
              className="boneyard-bone"
              style={{
                width: '65px',
                height: '10px',
                borderRadius: '9999px',
              }}
            />
            <div
              className="boneyard-bone"
              style={{
                width: '8px',
                height: '6px',
                borderRadius: '2px',
              }}
            />
          </div>

          {/* Checkbox toggle skeleton */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <div
              className="boneyard-bone"
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '3px',
              }}
            />
            <div
              className="boneyard-bone"
              style={{
                width: '68px',
                height: '10px',
                borderRadius: '9999px',
              }}
            />
          </div>

          {/* Two toggle icon buttons (grid vs table) */}
          <div
            style={{
              display: 'inline-flex',
              backgroundColor: 'var(--bg-elevated)',
              padding: '2px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-hairline)',
              gap: '2px',
            }}
          >
            <div
              className="boneyard-bone"
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '4px',
              }}
            />
            <div
              className="boneyard-bone"
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '4px',
              }}
            />
          </div>
        </div>
      </div>

      {/* Rows 3-4: 6 Project Cards in 3 Columns Grid (2 Rows x 3 Columns) */}
      <div
        className="cards-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '1rem',
        }}
      >
        {[1, 2, 3, 4, 5, 6].map((idx) => (
          <div
            key={idx}
            className="boneyard-card-skeleton"
            style={{
              padding: '1.25rem',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-hairline)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '155px',
            }}
          >
            <div>
              {/* Header: Icon square + Title bar + Status badge pill */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.85rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div
                    className="boneyard-bone"
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '8px',
                      flexShrink: 0,
                    }}
                  />
                  <div
                    className="boneyard-bone"
                    style={{
                      width: '120px',
                      height: '14px',
                      borderRadius: '9999px',
                    }}
                  />
                </div>
                <div
                  className="boneyard-bone"
                  style={{
                    width: '58px',
                    height: '20px',
                    borderRadius: '9999px',
                  }}
                />
              </div>

              {/* Description: 2 lines */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.1rem' }}>
                <div
                  className="boneyard-bone"
                  style={{
                    width: '88%',
                    height: '11px',
                    borderRadius: '9999px',
                  }}
                />
                <div
                  className="boneyard-bone"
                  style={{
                    width: '56%',
                    height: '11px',
                    borderRadius: '9999px',
                  }}
                />
              </div>
            </div>

            {/* Footer: Dataset count pill on left, date pill on right */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '0.65rem',
                borderTop: '1px solid var(--border-hairline)',
              }}
            >
              <div
                className="boneyard-bone"
                style={{
                  width: '74px',
                  height: '14px',
                  borderRadius: '9999px',
                }}
              />
              <div
                className="boneyard-bone"
                style={{
                  width: '64px',
                  height: '14px',
                  borderRadius: '9999px',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * 6 Project Cards Skeleton representing ONLY the fetched data boxes from the database.
 * Does not cover buttons, page titles, or stable HTML input controls.
 */
export const ProjectCardsSkeleton: React.FC = () => {
  return (
    <div
      className="cards-grid"
      aria-busy="true"
      aria-label="Loading project workspaces from database"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '1rem',
      }}
    >
      {[1, 2, 3, 4, 5, 6].map((idx) => (
        <div
          key={idx}
          className="boneyard-card-skeleton"
          style={{
            padding: '1.25rem',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-hairline)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '155px',
          }}
        >
          <div>
            {/* Header: Icon box + Title bar + Status badge pill */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div
                  className="boneyard-bone"
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    flexShrink: 0,
                  }}
                />
                <div
                  className="boneyard-bone"
                  style={{
                    width: '120px',
                    height: '14px',
                    borderRadius: '9999px',
                  }}
                />
              </div>
              <div
                className="boneyard-bone"
                style={{
                  width: '58px',
                  height: '20px',
                  borderRadius: '9999px',
                }}
              />
            </div>

            {/* Description: 2 lines */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.1rem' }}>
              <div
                className="boneyard-bone"
                style={{
                  width: '88%',
                  height: '11px',
                  borderRadius: '9999px',
                }}
              />
              <div
                className="boneyard-bone"
                style={{
                  width: '56%',
                  height: '11px',
                  borderRadius: '9999px',
                }}
              />
            </div>
          </div>

          {/* Footer: Dataset count pill on left, date pill on right */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '0.65rem',
              borderTop: '1px solid var(--border-hairline)',
            }}
          >
            <div
              className="boneyard-bone"
              style={{
                width: '74px',
                height: '14px',
                borderRadius: '9999px',
              }}
            />
            <div
              className="boneyard-bone"
              style={{
                width: '64px',
                height: '14px',
                borderRadius: '9999px',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

