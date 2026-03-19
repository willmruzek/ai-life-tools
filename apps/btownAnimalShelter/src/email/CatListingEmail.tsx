import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { type CatData } from '../agentConfig.ts';

interface CatListingEmailProps {
  data: CatData;
}

export function CatListingEmail({ data }: CatListingEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {String(data.final_extraction_count)} cats available at Bloomington
        Animal Shelter
      </Preview>
      <Body style={{ backgroundColor: '#f9f9f9', fontFamily: 'sans-serif' }}>
        <Container
          style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}
        >
          <Heading style={{ color: '#333' }}>
            🐱 Bloomington Animal Shelter — {data.final_extraction_count} Cats
            Available
          </Heading>
          <Text style={{ color: '#666', fontSize: '14px' }}>
            Sorted by age (youngest first)
          </Text>
          <Hr />

          {data.cats.map((cat, i) => (
            <Section
              key={`${cat.name}-${i}`}
              style={{
                backgroundColor: '#fff',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px',
                border: '1px solid #e5e5e5',
              }}
            >
              <Heading
                as="h2"
                style={{ color: '#333', fontSize: '20px', marginTop: 0 }}
              >
                {cat.name}
              </Heading>
              <Text style={{ margin: '4px 0', color: '#555' }}>
                <strong>Breed:</strong> {cat.breed}
              </Text>
              <Text style={{ margin: '4px 0', color: '#555' }}>
                <strong>Age:</strong> {cat.age}
              </Text>
              <Text style={{ margin: '4px 0', color: '#555' }}>
                <strong>Foster home:</strong>{' '}
                {cat.in_foster_home ? '🏠 Yes' : 'No'}
              </Text>

              {cat.img_srcs.length > 0 && (
                <Section style={{ marginTop: '12px' }}>
                  {cat.img_srcs.map((img, j) => (
                    <Img
                      key={`${cat.name}-img-${j}`}
                      src={img.value}
                      alt={`Photo of ${cat.name}`}
                      style={{
                        maxWidth: '100%',
                        borderRadius: '6px',
                        marginBottom: '8px',
                        display: 'block',
                      }}
                    />
                  ))}
                </Section>
              )}
            </Section>
          ))}
        </Container>
      </Body>
    </Html>
  );
}
