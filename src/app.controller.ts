import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { z } from 'zod';
import { Response } from 'express';

import { EFuelType } from '@caronsale/cos-vehicle-models';
import zodToJsonSchema from 'zod-to-json-schema';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { IAuctionFilter } from '@caronsale/cos-models';

@Controller()
export class AppController {
  constructor() {}

  private AVAILABLE_COUNTRIES = ['DE', 'AT', 'NL', 'FR'];
  private AVAILABLE_MILEAGES = [
    10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000, 100000, 120000,
    140000, 160000, 180000, 200000, 220000, 240000, 260000, 280000, 300000,
    320000, 340000, 360000, 380000,
  ];
  private AVAILABLE_SEARCH_RADIUS = [50, 100, 150, 200, 300, 400, 500];

  private model = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0,
    openAIApiKey:
      'asdasdasdasd',
    maxRetries: 3,
    timeout: 30000,
    maxConcurrency: 2,
  });

  public static getEnumKeys<E extends object>(enumType: E): (keyof E)[] {
    return Object.keys(enumType).filter((v) => isNaN(Number(v))) as (keyof E)[];
  }

  public static getEnumAsKeyValuePairs(enumType: any) {
    return Object.keys(enumType)
      .filter((v) => isNaN(Number(v)))
      .map((key) => ({ key, value: enumType[key] }));
  }

  @Get()
  async getHello(
    @Res() res: Response,
    @Query('humanPrompt') humanPrompt: string,
  ) {
    console.log(humanPrompt);
    const val = z.object({
      fuelTypes: z
        .nativeEnum(EFuelType)
        .optional()
        .array()
        .min(-1)
        .max(7)
        .describe(
          `this is the fuel type of the vehicle. User input will be an array if values are passed. Get the values from the following dictionary: ${JSON.stringify(AppController.getEnumAsKeyValuePairs(EFuelType))}. this field is optional. if no value is provided, dont use it`,
        ),
      includeCountries: z
        .enum(this.AVAILABLE_COUNTRIES as [string, ...string[]])
        .array()
        .optional()
        .describe(
          `this is the countries field. Countries from which auctions should be included in the search. this is an array of Country codes For Example: DE for Germany, FR for France, etc. Only accepts countries from the list. If more than one country is passed, ignore the zipcode field. If the distance field is passed, ignore this field as well`,
        ),
      locationZipCodeQuery: z
        .string()
        .optional()
        .describe(
          'This is the zipcode field. Filters auctions by the zipcode this can only have 2 digits. If passed more than 2 digits, only use the first 2. This field will only be added to the final schema if the includeCountries has only one entry, if more than one country is passed or no country is passed, ignore this field. If the distance field is passed, ignore this field as well',
        ),

      distance: z
        .object({
          radius: z
            .number()
            .optional()
            .describe(
              `This is the distance field. It represents on which radius around the user to search. Remove this field if includeCountries or zipcode is passed. If the value passed to this field is not an integer, convert to the nearest integer. The value has to be from this array: [${this.AVAILABLE_SEARCH_RADIUS.join(', ')}].`,
            ),
        })
        .optional(),
      vehicleSearchQuery: z.object({
        colors: z
          .string()
          .array()
          .optional()
          .describe(
            'the colors of the vehicle. The values should be in english.',
          ),
        makers: z
          .string()
          .array()
          .optional()
          .describe(
            'the maker of the vehicle, this is a string containing the name of the maker of the vehicle. normalize the string to contain the complete name of the manufacturer',
          ),
        ezFrom: z
          .string()
          .describe(
            'the lower bound of the registration date of the vehicle. this is a date string in the format YYYY. the lowest value this field accepts is 1887 and the highest is the current year. This field is optional',
          )
          .optional(),
        ezTo: z
          .string()
          .optional()
          .describe(
            'the upper bound of the registration date of the vehicle. this is a date string in the format YYYY. the lowest value this field accepts is 1887 and the highest is the current year. if a value is passed to this value and it is somehow lower than the ezFrom field, make it equal to the ezFrom. This field is optional',
          ),
        mileageFrom: z
          .number()
          .optional()
          .describe(
            `This is one of the mileage fields. The lower bound of the mileage of the vehicle.If the value passed to this field is not an integer, convert to the nearest integer. The value has to be from this array: [${this.AVAILABLE_MILEAGES.join(', ')}]. If the value is not in the array, use the closest value.`,
          ),
        mileageTo: z
          .number()
          .optional()
          .describe(
            `This is one of the mileage fields. The upper bound of the mileage of the vehicle. If the value passed to this field is not an integer, convert to the nearest integer. The value has to be from this array: [${this.AVAILABLE_MILEAGES.join(', ')}]. If the value is not in the array, use the closest value.`,
          ),
      }),
    });

    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `based on the schema for IAuctionFilter, generate a json that matches the IAuction filter schema. This schema represents a user query searching for vehicles.
        Pay extra attention to the description of each field, it contains important information about the field and how you should generate the final json.
        do not create fields that are not part of the schema
        respect all the constraints defined in the description of each field.
        if the value passed to a field is either too high or too low, normalize it to the closest value.
        if any field is an empty array or an empty string or null,  remove it from the final json.
        if the user asks for opinions, return an empty json.
        The schema is as follows:

        \`\`\`json 
        ${JSON.stringify(zodToJsonSchema(val), null, 4)
          .replace(/{/g, '{{')
          .replace(/}/g, '}}')}
        \`\`\`
        `,
      ],
      ['human', humanPrompt],
    ]);

    const response = await prompt
      .pipe(this.model)
      .pipe(new JsonOutputParser<IAuctionFilter>())
      .invoke({ input: humanPrompt });
    res.json(response);
  }
}
